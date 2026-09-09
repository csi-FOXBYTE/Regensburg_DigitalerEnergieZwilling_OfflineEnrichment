import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { openSpatialDatabase } from "../../src/db/spatial-database.js";
import type { SpatialDatabase } from "../../src/db/spatial-database.js";
import { extractFacesFromGeometry } from "../../src/geometry/face-extractor.js";
import { normalizeVerticesForGeometry } from "../../src/geometry/coordinate-normalization.js";
import { wallSplitHeight } from "../../src/geometry/roof-islands.js";
import { isCityJsonLike } from "../../src/validation/cityjson.js";
import { isObject } from "../../src/shared/guards.js";

const DATA_DIR = join(process.cwd(), "test/data");
const FILES = ["720_5432.json", "720_5434.json"];

function tryOpenDatabase(): SpatialDatabase | null {
  try {
    return openSpatialDatabase();
  } catch (e) {
    console.error("tryOpenDatabase failed:", e);
    return null;
  }
}

async function indexFile(db: SpatialDatabase, fileName: string): Promise<number> {
  const raw = await readFile(join(DATA_DIR, fileName), "utf-8");
  const parsed = JSON.parse(raw) as unknown;

  assert.ok(isCityJsonLike(parsed), `${fileName} should be valid CityJSON`);
  if (!isCityJsonLike(parsed)) return 0;

  const vertices = normalizeVerticesForGeometry(parsed, { sourceCrsFallback: "EPSG:25832" });
  let wallFaceCount = 0;

  for (const [id, cityObject] of Object.entries(parsed.CityObjects)) {
    if (!isObject(cityObject) || typeof cityObject.type !== "string") continue;
    if (cityObject.type !== "Building" && cityObject.type !== "BuildingPart") continue;

    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));
    db.addBuilding(id, fileName, cityObject.type, wallSplitHeight(faces));

    for (const face of faces) {
      if (face.semanticType !== "WallSurface") continue;
      db.addWallSurface(id, face);
      wallFaceCount++;
    }
  }

  return wallFaceCount;
}

test("db/spatial-database integration: indexes real CityJSON files and finds adjacencies", async (t) => {
  const db = tryOpenDatabase();
  if (!db) { t.skip("SpatiaLite not available"); return; }

  try {
    let totalWallFaces = 0;
    const t0 = performance.now();

    for (const file of FILES) {
      const t = performance.now();
      const count = await indexFile(db, file);
      console.log(`  index ${file}: ${(performance.now() - t).toFixed(1)} ms  (${count} wall faces)`);
      totalWallFaces += count;
    }
    console.log(`  total index: ${(performance.now() - t0).toFixed(1)} ms  (${totalWallFaces} wall faces)`);

    assert.ok(totalWallFaces > 0, "Expected wall faces to be indexed");

    const t1 = performance.now();
    db.computeAdjacencies(0.5);
    console.log(`  computeAdjacencies: ${(performance.now() - t1).toFixed(1)} ms`);

    // Collect all building IDs from both files
    const raw0 = await readFile(join(DATA_DIR, FILES[0]!), "utf-8");
    const parsed0 = JSON.parse(raw0) as unknown;
    assert.ok(isCityJsonLike(parsed0));
    if (!isCityJsonLike(parsed0)) return;

    const buildingIds = Object.keys(parsed0.CityObjects).filter((id) => {
      const obj = parsed0.CityObjects[id];
      return isObject(obj) && (obj.type === "Building" || obj.type === "BuildingPart");
    });

    const t2 = performance.now();
    const adjacencies = buildingIds.map((id) => db.getAdjacencies(id));
    const adjacentBuildings = adjacencies.filter((a) => a.length > 0);
    const totalArea = adjacencies.flat().reduce((sum, a) => sum + a.sharedWallArea, 0);
    for (const adjacency of adjacencies.flat()) {
      assert.notEqual(adjacency.sharedWallAreaWithoutAttic, null);
      assert.notEqual(adjacency.sharedWallAreaAttic, null);
      assert.ok(adjacency.sharedWallAreaWithoutAttic! >= 0);
      assert.ok(adjacency.sharedWallAreaAttic! >= 0);
      assert.ok(Math.abs(adjacency.sharedWallAreaWithoutAttic! + adjacency.sharedWallAreaAttic! - adjacency.sharedWallArea) < 1e-9);
    }
    console.log(`  getAdjacencies (${buildingIds.length} buildings): ${(performance.now() - t2).toFixed(1)} ms`);
    console.log(`  adjacent buildings found: ${adjacentBuildings.length}`);
    console.log(`  total shared wall area: ${totalArea.toFixed(2)} m²`);

    assert.ok(
      adjacentBuildings.length > 0,
      `Expected at least one adjacent building pair across the two tiles, got 0 out of ${buildingIds.length} checked`,
    );
  } finally {
    db.close();
  }
});
