import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { spatialConfig } from "../config/spatial.js";
import { isExternalWallFace, wallFaceIntersectionAreas } from "../geometry/polygon-math.js";
import type { PolygonFace, Vertex } from "../shared/types.js";

/**
 * A single adjacency record returned by {@link SpatialDatabase.getAdjacencies}.
 *
 * @group Database
 */
export interface AdjacencyResult {
  buildingId: string;
  sharedWallArea: number;
  /** Shared area at or below this building's eaves; null without a usable roof. */
  sharedWallAreaWithoutAttic: number | null;
  /** Shared area above this building's eaves; null without a usable roof. */
  sharedWallAreaAttic: number | null;
}

interface WallFaceCandidate {
  buildingA: string;
  buildingB: string;
  ringsA: string;
  ringsB: string;
  splitHeightA: number | null;
  splitHeightB: number | null;
}

/**
 * Size of the adjacency comparison attributed to one file, measured by
 * {@link SpatialDatabase.measureCandidatePairs}.
 *
 * @group Database
 */
export interface CandidatePairMeasure {
  /** Candidate wall pairs counted; may end in .5 as pairs within the file are seen from both walls. */
  pairs: number;
  /** Sum of the product of both walls' vertex counts over the counted pairs. */
  vertexProducts: number;
  /** True when counting stopped because a budget was exceeded. */
  exceeded: boolean;
}

/** A geothermal parcel prepared for insertion into the temporary database. */
export interface GeothermalZoneInput {
  category: string | null;
  available: boolean;
  wkb: Buffer;
}

function ringToLineStringWkt(ring: Vertex[]): string {
  return `LINESTRING(${ring.map(([x, y]) => `${x} ${y}`).join(", ")})`;
}

function loadSpatialite(db: Database.Database): void {
  const paths = process.env.SPATIALITE_PATH
    ? [process.env.SPATIALITE_PATH]
    : ["mod_spatialite"];

  for (const path of paths) {
    try {
      db.loadExtension(path);
      return;
    } catch {
      // try next
    }
  }

  db.close();
  throw new Error(
    "SpatiaLite extension not found. Install libsqlite3-mod-spatialite (Debian/Ubuntu) or libspatialite (Alpine), or set SPATIALITE_PATH.",
  );
}

/**
 * Opens a SpatiaLite database in a temporary file with WAL mode enabled.
 * Two connections are opened: a write connection for all mutations and a
 * read-only connection for the adjacency iterator, allowing both to run
 * concurrently without SQLITE_BUSY conflicts.
 * The temp file is deleted when {@link SpatialDatabase.close} is called.
 *
 * @group Database
 * @param computeIntersectionAreas Intersection function receiving both polygons, the tolerance and each building's absolute split elevation.
 * @returns Database handle with methods for the three pipeline passes.
 */
export function openSpatialDatabase(
  computeIntersectionAreas: typeof wallFaceIntersectionAreas = wallFaceIntersectionAreas,
) {
  const { srid } = spatialConfig;
  const tmpDir = mkdtempSync(join(tmpdir(), "spatialdb-"));
  const dbPath = join(tmpDir, "spatial.db");

  const db = new Database(dbPath);
  loadSpatialite(db);
  db.exec("PRAGMA journal_mode=WAL");

  const dbRead = new Database(dbPath, { readonly: true });
  loadSpatialite(dbRead);

  db.exec(`SELECT InitSpatialMetaData(1)`);
  db.exec(`
    CREATE TABLE buildings (
      id   TEXT PRIMARY KEY,
      file TEXT NOT NULL,
      type TEXT NOT NULL,
      split_height REAL
    )
  `);
  db.exec(`
    CREATE TABLE wall_surfaces (
      building_id  TEXT NOT NULL REFERENCES buildings(id),
      rings        TEXT NOT NULL,
      vertex_count INTEGER NOT NULL
    )
  `);
  db.exec(`SELECT AddGeometryColumn('wall_surfaces', 'bbox_xy', ${srid}, 'LINESTRING', 'XY')`);
  db.exec(`SELECT CreateSpatialIndex('wall_surfaces', 'bbox_xy')`);
  db.exec(`
    CREATE TABLE adjacencies (
      building_a       TEXT NOT NULL REFERENCES buildings(id),
      building_b       TEXT NOT NULL REFERENCES buildings(id),
      shared_wall_area REAL NOT NULL,
      below_a          REAL,
      below_b          REAL
    )
  `);
  db.exec(`
    CREATE TABLE age_zones (
      id         INTEGER PRIMARY KEY,
      dominant   TEXT NOT NULL,
      lower_year INTEGER
    )
  `);
  db.exec(`SELECT AddGeometryColumn('age_zones', 'geom', ${srid}, 'MULTIPOLYGON', 'XY')`);
  db.exec(`SELECT CreateSpatialIndex('age_zones', 'geom')`);
  db.exec(`
    CREATE TABLE geothermal_zones (
      id        INTEGER PRIMARY KEY,
      category  TEXT,
      available INTEGER NOT NULL CHECK (available IN (0, 1))
    )
  `);
  db.exec(`SELECT AddGeometryColumn('geothermal_zones', 'geom', ${srid}, 'MULTIPOLYGON', 'XY')`);
  db.exec(`SELECT CreateSpatialIndex('geothermal_zones', 'geom')`);

  const stmtInsertBuilding = db.prepare<[string, string, string, number | null]>(`
    INSERT INTO buildings (id, file, type, split_height) VALUES (?, ?, ?, ?)
  `);

  const stmtInsertWallSurface = db.prepare<[string, string, number, string]>(`
    INSERT INTO wall_surfaces (building_id, rings, vertex_count, bbox_xy)
    VALUES (?, ?, ?, GeomFromText(?, ${srid}))
  `);

  const stmtWallSurfaceWatermark = db.prepare(`SELECT COALESCE(MAX(rowid), 0) FROM wall_surfaces`).pluck();

  // The R*Tree lookup of stmtCandidates for the walls inserted after a
  // watermark, without its later filters: every row returned here is a row
  // stmtCandidates visits. Runs on the write connection so it sees the
  // uncommitted walls of the current file.
  const stmtNewCandidatePairs = db.prepare<{ after: number; tol: number }>(`
    SELECT b.rowid > @after AS bothNew, a.vertex_count * b.vertex_count AS product
    FROM wall_surfaces a, wall_surfaces b
    WHERE a.rowid > @after
      AND b.rowid <> a.rowid
      AND b.rowid IN (
        SELECT ROWID FROM SpatialIndex
        WHERE f_table_name      = 'wall_surfaces'
          AND f_geometry_column = 'bbox_xy'
          AND search_frame      = ST_Expand(a.bbox_xy, @tol)
      )
  `).raw();

  const stmtCandidates = dbRead.prepare<{ tol: number }>(`
    SELECT
      a.building_id AS buildingA,
      b.building_id AS buildingB,
      a.rings       AS ringsA,
      b.rings       AS ringsB,
      (SELECT split_height FROM buildings WHERE id = a.building_id) AS splitHeightA,
      (SELECT split_height FROM buildings WHERE id = b.building_id) AS splitHeightB
    FROM wall_surfaces a, wall_surfaces b
    WHERE a.building_id < b.building_id
      AND b.rowid IN (
        SELECT ROWID FROM SpatialIndex
        WHERE f_table_name      = 'wall_surfaces'
          AND f_geometry_column = 'bbox_xy'
          AND search_frame      = ST_Expand(a.bbox_xy, @tol)
      )
      AND ST_Distance(a.bbox_xy, b.bbox_xy) <= @tol
  `);

  const stmtInsertAdjacency = db.prepare<[string, string, number, number | null, number | null]>(`
    INSERT INTO adjacencies (building_a, building_b, shared_wall_area, below_a, below_b) VALUES (?, ?, ?, ?, ?)
  `);

  const stmtGetAdjacencies = db.prepare<{ id: string }>(`
    SELECT
      CASE WHEN building_a = @id THEN building_b ELSE building_a END AS buildingId,
      SUM(shared_wall_area) AS sharedWallArea,
      SUM(CASE WHEN building_a = @id THEN below_a ELSE below_b END) AS sharedWallAreaWithoutAttic
    FROM adjacencies
    WHERE building_a = @id OR building_b = @id
    GROUP BY buildingId
  `);

  const stmtInsertAgeZone = db.prepare<[string, number | null, Buffer]>(`
    INSERT INTO age_zones (dominant, lower_year, geom)
    VALUES (?, ?, ST_GeomFromWKB(?, ${srid}))
  `);

  const stmtGetConstructionYear = db.prepare<{ cx: number; cy: number }>(`
    SELECT lower_year FROM age_zones
    WHERE rowid IN (
      SELECT ROWID FROM SpatialIndex
      WHERE f_table_name      = 'age_zones'
        AND f_geometry_column = 'geom'
        AND search_frame      = MakePoint(:cx, :cy, ${srid})
    )
    AND ST_Within(MakePoint(:cx, :cy, ${srid}), geom)
    LIMIT 1
  `);

  const stmtInsertGeothermalZone = db.prepare<[string | null, number, Buffer]>(`
    INSERT INTO geothermal_zones (category, available, geom)
    VALUES (?, ?, ST_GeomFromWKB(?, ${srid}))
  `);
  const insertGeothermalZones = db.transaction((zones: Iterable<GeothermalZoneInput>) => {
    for (const { category, available, wkb } of zones) {
      stmtInsertGeothermalZone.run(category, available ? 1 : 0, wkb);
    }
  });

  const stmtGetGeothermalAvailability = db.prepare<{ cx: number; cy: number }>(`
    SELECT available FROM geothermal_zones
    WHERE rowid IN (
      SELECT ROWID FROM SpatialIndex
      WHERE f_table_name      = 'geothermal_zones'
        AND f_geometry_column = 'geom'
        AND search_frame      = MakePoint(:cx, :cy, ${srid})
    )
    AND ST_Within(MakePoint(:cx, :cy, ${srid}), geom)
    LIMIT 1
  `);

  return {
    /**
     * Indexes one building's metadata. Called once per building during pass 1.
     *
     * @group Database
     */
    addBuilding(id: string, file: string, type: string, splitHeight: number | null = null): void {
      stmtInsertBuilding.run(id, file, type, splitHeight !== null && Number.isFinite(splitHeight) ? splitHeight : null);
    },

    /**
     * Indexes one wall surface face. Called once per WallSurface face during pass 1.
     *
     * @group Database
     */
    addWallSurface(buildingId: string, face: PolygonFace): void {
      if (!isExternalWallFace(face)) return;
      const outerRing = face.rings[0] ?? [];
      stmtInsertWallSurface.run(
        buildingId,
        JSON.stringify(face.rings),
        face.rings.reduce((sum, ring) => sum + ring.length, 0),
        ringToLineStringWkt(outerRing),
      );
    },

    /**
     * Runs `fn` in one write transaction; an exception rolls back every write
     * made by `fn` and is rethrown.
     *
     * @group Database
     */
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },

    /**
     * Returns the highest wall surface row id so far; walls added afterwards
     * have larger ids.
     *
     * @group Database
     */
    wallSurfaceWatermark(): number {
      return stmtWallSurfaceWatermark.get() as number;
    },

    /**
     * Counts the candidate wall pairs that the walls added after `afterRowid`
     * contribute to `computeAdjacencies`, and sums the product of both walls'
     * vertex counts. A candidate pair is a pair of walls whose bounding boxes
     * lie within the tolerance of each other, as found by the R*Tree broad
     * phase, including pairs with earlier walls and pairs within one building
     * (the broad phase visits those too). This is an upper bound of the pairs
     * that reach the distance check and the overlap clipping. Counting stops
     * as soon as either budget is exceeded, so its own cost is bounded by the
     * budgets rather than by the number of pairs.
     *
     * @group Database
     * @param afterRowid Watermark from `wallSurfaceWatermark`.
     * @param tolerance Same tolerance as passed to `computeAdjacencies`.
     * @param maxPairs Pair budget.
     * @param maxVertexProducts Vertex-count product budget.
     */
    measureCandidatePairs(
      afterRowid: number,
      tolerance: number,
      maxPairs: number,
      maxVertexProducts: number,
    ): CandidatePairMeasure {
      // A pair of two new walls is returned once from each side, a pair with
      // an earlier wall once. Count in half pairs to keep integers.
      let halfPairs = 0;
      let halfVertexProducts = 0;
      const measure = (exceeded: boolean): CandidatePairMeasure => ({
        pairs: halfPairs / 2,
        vertexProducts: halfVertexProducts / 2,
        exceeded,
      });
      for (const [bothNew, product] of stmtNewCandidatePairs.iterate({ after: afterRowid, tol: tolerance }) as Iterable<[number, number]>) {
        const halves = bothNew === 1 ? 1 : 2;
        halfPairs += halves;
        halfVertexProducts += halves * product;
        if (halfPairs > 2 * maxPairs || halfVertexProducts > 2 * maxVertexProducts) return measure(true);
      }
      return measure(false);
    },

    /**
     * Finds adjacent wall face pairs via the R*Tree broad-phase, computes the 3D
     * intersection area for each candidate in TypeScript, and writes results to
     * `adjacencies`. Called once during pass 2.
     *
     * The read-only connection streams candidates via an iterator while the write
     * connection inserts results — WAL mode allows both to proceed concurrently.
     *
     * @group Database
     * @param tolerance Maximum XY distance and wall-plane separation in metres.
     */
    computeAdjacencies(tolerance: number): void {
      for (const candidate of stmtCandidates.iterate({ tol: tolerance })) {
        const { buildingA, buildingB, ringsA, ringsB, splitHeightA, splitHeightB } = candidate as WallFaceCandidate;
        const faceA = JSON.parse(ringsA) as Vertex[][];
        const faceB = JSON.parse(ringsB) as Vertex[][];
        const { area, belowA, belowB } = computeIntersectionAreas(faceA, faceB, tolerance, splitHeightA, splitHeightB);
        if (area > 0) {
          stmtInsertAdjacency.run(buildingA, buildingB, area, belowA, belowB);
        }
      }
    },

    /**
     * Returns adjacency results for one building. Called per building during pass 3.
     *
     * @group Database
     * @param buildingId CityJSON object key.
     * @returns Adjacent buildings with total shared area and portions relative to the queried building's eaves.
     */
    getAdjacencies(buildingId: string): AdjacencyResult[] {
      const rows = stmtGetAdjacencies.all({ id: buildingId }) as Omit<AdjacencyResult, "sharedWallAreaAttic">[];
      return rows.map((row) => ({
        ...row,
        sharedWallAreaAttic: row.sharedWallAreaWithoutAttic === null
          ? null
          : row.sharedWallArea - row.sharedWallAreaWithoutAttic,
      }));
    },

    /**
     * Inserts one age zone from a pre-stripped WKB buffer. Called during the
     * age zone import step before pass 1.
     *
     * @group Database
     * @param dominant Raw value from the configured age-zone classification column.
     * @param lowerYear Parsed lower bound year, or null for unknown ranges.
     * @param wkb WKB geometry buffer with the GPKG header already removed.
     */
    addAgeZone(dominant: string, lowerYear: number | null, wkb: Buffer): void {
      stmtInsertAgeZone.run(dominant, lowerYear, wkb);
    },

    /**
     * Returns the construction year for the age zone containing the given point,
     * or null if no zone matches.
     *
     * @group Database
     * @param cx X coordinate in the configured analysis CRS.
     * @param cy Y coordinate in the configured analysis CRS.
     */
    getConstructionYear(cx: number, cy: number): number | null {
      const row = stmtGetConstructionYear.get({ cx, cy }) as { lower_year: number | null } | undefined;
      return row?.lower_year ?? null;
    },

    /**
     * Inserts geothermal zones in one transaction to keep large GeoPackage
     * imports fast.
     *
     * @group Database
     */
    addGeothermalZones(zones: Iterable<GeothermalZoneInput>): void {
      insertGeothermalZones(zones);
    },

    /**
     * Returns groundwater heat-pump availability for the parcel containing the
     * given point, or null if no imported parcel matches.
     *
     * @group Database
     * @param cx X coordinate in the configured analysis CRS.
     * @param cy Y coordinate in the configured analysis CRS.
     */
    getGeothermalEnergyAvailability(cx: number, cy: number): boolean | null {
      const row = stmtGetGeothermalAvailability.get({ cx, cy }) as
        | { available: number }
        | undefined;
      return row == null ? null : row.available === 1;
    },

    /**
     * Closes both database connections and removes the temporary database file.
     */
    close(): void {
      dbRead.close();
      db.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        try { unlinkSync(dbPath + suffix); } catch { /* already gone */ }
      }
      try { rmdirSync(tmpDir); } catch { /* already gone */ }
    },
  };
}

/**
 * Inferred type of the value returned by {@link openSpatialDatabase}.
 *
 * @group Database
 */
export type SpatialDatabase = ReturnType<typeof openSpatialDatabase>;
