import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { openSpatialDatabase } from "../../src/db/spatial-database.js";
import { calculateBuildingGeometryMetrics } from "../../src/geometry/building-metrics.js";
import { normalizeVerticesForGeometry } from "../../src/geometry/coordinate-normalization.js";
import { extractFacesFromGeometry } from "../../src/geometry/face-extractor.js";
import { polygonArea, wallFaceIntersectionArea } from "../../src/geometry/polygon-math.js";
import { isCityJsonLike } from "../../src/validation/cityjson.js";

// Top view; both bricks are 1 m tall. Contact is x=[1,2], y=0, z=[0,1].
// +-----------+
// | crossbar  |  3 x 1 m
// +---+---+---+
//     |stem|     1 x 1 m
//     +----+
const fixture: unknown = JSON.parse(
  readFileSync(new URL("../data/t-shaped-bricks.json", import.meta.url), "utf8"),
);
assert.ok(isCityJsonLike(fixture));
const vertices = normalizeVerticesForGeometry(fixture);
const buildings = Object.entries(fixture.CityObjects).map(([id, object]) => ({
  id,
  faces: (object.geometry ?? []).flatMap((geometry) => extractFacesFromGeometry(geometry, vertices)),
}));
const crossbar = buildings.find(({ id }) => id === "crossbar")!;
const stem = buildings.find(({ id }) => id === "stem")!;

test("T-shaped bricks: ground, roof, walls and volume match brick dimensions", () => {
  for (const [building, footprint, wallArea, envelope] of [
    [crossbar, 3, 8, 14],
    [stem, 1, 4, 6],
  ] as const) {
    const metrics = calculateBuildingGeometryMetrics(building.faces);
    assert.equal(metrics.groundArea, footprint);
    assert.equal(metrics.upperFloorArea, footprint);
    assert.equal(metrics.roofArea, footprint);
    assert.equal(metrics.grossExternalWallArea, wallArea);
    assert.equal(metrics.envelopeArea, envelope);
    assert.equal(metrics.height, 1);
    assert.ok(Math.abs(metrics.volume - footprint) < 1e-9);
  }
});

test("T-shaped bricks: the 1 m² wall shares exactly 1 m² with the 3 m² wall", () => {
  const largeWall = crossbar.faces[2]!.rings[0]!;
  const smallWall = stem.faces[4]!.rings[0]!;
  assert.equal(polygonArea([largeWall]), 3);
  assert.equal(polygonArea([smallWall]), 1);
  assert.equal(wallFaceIntersectionArea(largeWall, smallWall), 1);
  assert.equal(wallFaceIntersectionArea(smallWall, largeWall), 1);
});

test("T-shaped bricks: adjacency totals exactly 1 m² per building", () => {
  const db = openSpatialDatabase(wallFaceIntersectionArea);
  try {
    for (const building of buildings) {
      db.addBuilding(building.id, "t-shaped-bricks.json", "Building");
      for (const face of building.faces) {
        if (face.semanticType === "WallSurface") db.addWallSurface(building.id, face);
      }
    }
    db.computeAdjacencies(0.15);
    const fromCrossbar = db.getAdjacencies("crossbar");
    const fromStem = db.getAdjacencies("stem");
    assert.deepEqual(fromCrossbar, [{ buildingId: "stem", sharedWallArea: 1 }]);
    assert.deepEqual(fromStem, [{ buildingId: "crossbar", sharedWallArea: 1 }]);
  } finally {
    db.close();
  }
});

test("staggered bricks: two 4 m walls offset by 2 m share exactly 2 m²", () => {
  // Reuse the brick topology, expanding both footprints to 4 x 1 m.
  const staggeredVertices = vertices.map(([x, y, z], i): [number, number, number] => [
    i < 8 ? (x === 3 ? 4 : x) : (x === 1 ? 2 : 6), y, z,
  ]);
  const db = openSpatialDatabase(wallFaceIntersectionArea);
  try {
    for (const [id, object] of Object.entries(fixture.CityObjects)) {
      db.addBuilding(id, "staggered-bricks", "Building");
      const faces = (object.geometry ?? []).flatMap((geometry) => extractFacesFromGeometry(geometry, staggeredVertices));
      assert.equal(calculateBuildingGeometryMetrics(faces).grossExternalWallArea, 10);
      for (const face of faces) {
        if (face.semanticType === "WallSurface") db.addWallSurface(id, face);
      }
    }
    db.computeAdjacencies(0.15);
    assert.deepEqual(db.getAdjacencies("crossbar"), [{ buildingId: "stem", sharedWallArea: 2 }]);
    assert.deepEqual(db.getAdjacencies("stem"), [{ buildingId: "crossbar", sharedWallArea: 2 }]);
  } finally {
    db.close();
  }
});
