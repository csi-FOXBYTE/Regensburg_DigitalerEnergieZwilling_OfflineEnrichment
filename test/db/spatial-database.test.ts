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

function multipolygonWkb(points: [number, number][]): Buffer {
  const buffer = Buffer.alloc(9 + 9 + 4 + points.length * 16);
  let offset = 0;

  buffer.writeUInt8(1, offset);
  offset += 1;
  buffer.writeUInt32LE(6, offset);
  offset += 4;
  buffer.writeUInt32LE(1, offset);
  offset += 4;

  buffer.writeUInt8(1, offset);
  offset += 1;
  buffer.writeUInt32LE(3, offset);
  offset += 4;
  buffer.writeUInt32LE(1, offset);
  offset += 4;
  buffer.writeUInt32LE(points.length, offset);
  offset += 4;

  for (const [x, y] of points) {
    buffer.writeDoubleLE(x, offset);
    offset += 8;
    buffer.writeDoubleLE(y, offset);
    offset += 8;
  }

  return buffer;
}

test("db/spatial-database: database opens and schema initialises", (t) => {
  const db = tryOpenDatabase(() => 0);
  if (!db) { t.skip("SpatiaLite not available"); return; }
  db.close();
});

test("db/spatial-database: geothermal availability distinguishes matches from missing data", (t) => {
  const db = tryOpenDatabase(() => 0);
  if (!db) { t.skip("SpatiaLite not available"); return; }
  try {
    const availableZone = multipolygonWkb([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const unavailableZone = multipolygonWkb([
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
      [20, 20],
    ]);

    db.addGeothermalZones([
      { category: "5-10_kW", available: true, wkb: availableZone },
      { category: "<5_kW", available: false, wkb: unavailableZone },
    ]);

    assert.equal(db.getGeothermalEnergyAvailability(5, 5), true);
    assert.equal(db.getGeothermalEnergyAvailability(25, 25), false);
    assert.equal(db.getGeothermalEnergyAvailability(15, 15), null);
  } finally {
    db.close();
  }
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
