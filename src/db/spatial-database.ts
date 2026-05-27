import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import type { PolygonFace, Vertex } from "../shared/types.js";

/**
 * A single adjacency record returned by {@link SpatialDatabase.getAdjacencies}.
 *
 * @group Database
 */
export interface AdjacencyResult {
  buildingId: string;
  sharedWallArea: number;
}

interface WallFaceCandidate {
  buildingA: string;
  buildingB: string;
  verticesA: string;
  verticesB: string;
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
 * @param computeIntersectionArea 3D wall-face intersection function supplied by the caller.
 * @returns Database handle with methods for the three pipeline passes.
 */
export function openSpatialDatabase(
  computeIntersectionArea: (a: Vertex[], b: Vertex[]) => number,
) {
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
      type TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE wall_surfaces (
      building_id TEXT NOT NULL REFERENCES buildings(id),
      vertices    TEXT NOT NULL
    )
  `);
  db.exec(`SELECT AddGeometryColumn('wall_surfaces', 'bbox_xy', 25832, 'LINESTRING', 'XY')`);
  db.exec(`SELECT CreateSpatialIndex('wall_surfaces', 'bbox_xy')`);
  db.exec(`
    CREATE TABLE adjacencies (
      building_a       TEXT NOT NULL REFERENCES buildings(id),
      building_b       TEXT NOT NULL REFERENCES buildings(id),
      shared_wall_area REAL NOT NULL
    )
  `);

  const stmtInsertBuilding = db.prepare<[string, string, string]>(`
    INSERT INTO buildings (id, file, type) VALUES (?, ?, ?)
  `);

  const stmtInsertWallSurface = db.prepare<[string, string, string]>(`
    INSERT INTO wall_surfaces (building_id, vertices, bbox_xy)
    VALUES (?, ?, GeomFromText(?, 25832))
  `);

  const stmtCandidates = dbRead.prepare<{ tol: number }>(`
    SELECT
      a.building_id AS buildingA,
      b.building_id AS buildingB,
      a.vertices    AS verticesA,
      b.vertices    AS verticesB
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

  const stmtInsertAdjacency = db.prepare<[string, string, number]>(`
    INSERT INTO adjacencies (building_a, building_b, shared_wall_area) VALUES (?, ?, ?)
  `);

  const stmtGetAdjacencies = db.prepare<[string, string, string]>(`
    SELECT
      CASE WHEN building_a = ? THEN building_b ELSE building_a END AS buildingId,
      SUM(shared_wall_area) AS sharedWallArea
    FROM adjacencies
    WHERE building_a = ? OR building_b = ?
    GROUP BY buildingId
  `);

  return {
    /**
     * Indexes one building's metadata. Called once per building during pass 1.
     *
     * @group Database
     */
    addBuilding(id: string, file: string, type: string): void {
      stmtInsertBuilding.run(id, file, type);
    },

    /**
     * Indexes one wall surface face. Called once per WallSurface face during pass 1.
     *
     * @group Database
     */
    addWallSurface(buildingId: string, face: PolygonFace): void {
      const outerRing = face.rings[0] ?? [];
      stmtInsertWallSurface.run(
        buildingId,
        JSON.stringify(outerRing),
        ringToLineStringWkt(outerRing),
      );
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
     * @param tolerance Maximum bbox distance (metres) to consider a pair a candidate.
     */
    computeAdjacencies(tolerance: number): void {
      for (const candidate of stmtCandidates.iterate({ tol: tolerance })) {
        const { buildingA, buildingB, verticesA, verticesB } = candidate as WallFaceCandidate;
        const faceA = JSON.parse(verticesA) as Vertex[];
        const faceB = JSON.parse(verticesB) as Vertex[];
        const area = computeIntersectionArea(faceA, faceB);
        if (area > 0) {
          stmtInsertAdjacency.run(buildingA, buildingB, area);
        }
      }
    },

    /**
     * Returns adjacency results for one building. Called per building during pass 3.
     *
     * @group Database
     * @param buildingId CityJSON object key.
     * @returns Adjacent buildings with their total shared wall area.
     */
    getAdjacencies(buildingId: string): AdjacencyResult[] {
      return stmtGetAdjacencies.all(buildingId, buildingId, buildingId) as AdjacencyResult[];
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
