import assert from "node:assert/strict";
import test from "node:test";

import { openSpatialDatabase } from "../../src/db/spatial-database.js";
import type { SpatialDatabase } from "../../src/db/spatial-database.js";
import type { PolygonFace, Vertex } from "../../src/shared/types.js";

/**
 * Returns null and prints a warning if SpatiaLite is not available in this environment.
 * Set SPATIALITE_PATH to point to the correct mod_spatialite location if needed.
 */
function tryOpenDatabase(fn: (a: Vertex[], b: Vertex[]) => number): SpatialDatabase | null {
  try {
    return openSpatialDatabase(fn);
  } catch (e) {
    console.error("tryOpenDatabase failed:", e);
    return null;
  }
}

/**
 * A simple vertical wall face at a fixed X, spanning the given Y and Z ranges.
 * The outer ring goes: bottom-left → bottom-right → top-right → top-left.
 */
function wallFace(x: number, yMin: number, yMax: number, zMin: number, zMax: number): PolygonFace {
  return {
    semanticType: "WallSurface",
    rings: [
      [
        [x, yMin, zMin],
        [x, yMax, zMin],
        [x, yMax, zMax],
        [x, yMin, zMax],
      ],
    ],
  };
}

test("db/spatial-database: database opens and schema initialises", (t) => {
  const db = tryOpenDatabase(() => 0);
  if (!db) { t.skip("SpatiaLite not available"); return; }
  db.close();
});

test("db/spatial-database: isolated building has no adjacencies", (t) => {
  const db = tryOpenDatabase(() => 0);
  if (!db) { t.skip("SpatiaLite not available"); return; }
  try {
    db.addBuilding("a", "file.json", "Building");
    assert.deepEqual(db.getAdjacencies("a"), []);
  } finally {
    db.close();
  }
});

test("db/spatial-database: adjacent wall faces produce an adjacency with the computed area", (t) => {
  let calls = 0;
  const db = tryOpenDatabase(() => { calls++; return 6.0; });
  if (!db) { t.skip("SpatiaLite not available"); return; }
  try {
    db.addBuilding("a", "a.json", "Building");
    db.addBuilding("b", "b.json", "Building");

    // Two buildings sharing a wall at X=1, Y=[0,1], Z=[0,3]
    db.addWallSurface("a", wallFace(1, 0, 1, 0, 3));
    db.addWallSurface("b", wallFace(1, 0, 1, 0, 3));

    db.computeAdjacencies(0.5);

    assert.equal(calls, 1);

    const fromA = db.getAdjacencies("a");
    assert.equal(fromA.length, 1);
    assert.equal(fromA[0]?.buildingId, "b");
    assert.equal(fromA[0]?.sharedWallArea, 6.0);

    // symmetric: querying from b returns a
    const fromB = db.getAdjacencies("b");
    assert.equal(fromB.length, 1);
    assert.equal(fromB[0]?.buildingId, "a");
    assert.equal(fromB[0]?.sharedWallArea, 6.0);
  } finally {
    db.close();
  }
});

test("db/spatial-database: wall faces beyond tolerance are not candidates", (t) => {
  let calls = 0;
  const db = tryOpenDatabase(() => { calls++; return 6.0; });
  if (!db) { t.skip("SpatiaLite not available"); return; }
  try {
    db.addBuilding("a", "a.json", "Building");
    db.addBuilding("b", "b.json", "Building");

    db.addWallSurface("a", wallFace(0, 0, 1, 0, 3));
    db.addWallSurface("b", wallFace(100, 0, 1, 0, 3)); // 100 m apart

    db.computeAdjacencies(0.5);

    assert.equal(calls, 0);
    assert.deepEqual(db.getAdjacencies("a"), []);
  } finally {
    db.close();
  }
});

test("db/spatial-database: multiple face pairs for the same building pair are summed", (t) => {
  const db = tryOpenDatabase(() => 4.0);
  if (!db) { t.skip("SpatiaLite not available"); return; }
  try {
    db.addBuilding("a", "a.json", "Building");
    db.addBuilding("b", "b.json", "Building");

    // Two separate shared segments, both within tolerance
    db.addWallSurface("a", wallFace(1, 0, 1, 0, 3));
    db.addWallSurface("b", wallFace(1, 0, 1, 0, 3));
    db.addWallSurface("a", wallFace(1, 5, 6, 0, 3)); // separate segment, far in Y
    db.addWallSurface("b", wallFace(1, 5, 6, 0, 3));

    db.computeAdjacencies(0.5);

    const adj = db.getAdjacencies("a");
    assert.equal(adj.length, 1);
    assert.equal(adj[0]?.sharedWallArea, 8.0); // 2 pairs × 4.0
  } finally {
    db.close();
  }
});

test("db/spatial-database: zero intersection area is not recorded", (t) => {
  const db = tryOpenDatabase(() => 0);
  if (!db) { t.skip("SpatiaLite not available"); return; }
  try {
    db.addBuilding("a", "a.json", "Building");
    db.addBuilding("b", "b.json", "Building");

    db.addWallSurface("a", wallFace(1, 0, 1, 0, 3));
    db.addWallSurface("b", wallFace(1, 0, 1, 0, 3));

    db.computeAdjacencies(0.5);

    assert.deepEqual(db.getAdjacencies("a"), []);
  } finally {
    db.close();
  }
});
