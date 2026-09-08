import assert from "node:assert/strict";
import test from "node:test";

import { findRoofIslands } from "../../src/geometry/roof-islands.js";
import type { PolygonFace, Vertex } from "../../src/shared/types.js";

function roof(x0: number, y0: number, x1: number, y1: number, z = 5): PolygonFace {
  return { semanticType: "RoofSurface", rings: [[[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]] };
}

test("roof islands: largest combined area wins over the largest individual face", () => {
  const a = roof(0, 0, 2, 2);
  const b = roof(2, 0, 4, 2);
  const detached = roof(10, 0, 13, 2, 1);
  const highDetail = roof(20, 0, 21, 1, 30);
  for (const faces of [[detached, a, b, highDetail], [highDetail, b, a, detached]]) {
    const islands = findRoofIslands(faces);
    assert.deepEqual(islands.map(({ area }) => area), [8, 6, 1]);
    assert.equal(islands[0]!.minHeight, 5);
  }
});

test("roof islands: connectivity is transitive across multiple faces", () => {
  const a = roof(0, 0, 1, 1);
  const b = roof(1, 0, 2, 1);
  const c = roof(2, 0, 3, 1);
  const islands = findRoofIslands([c, a, b]);
  assert.equal(islands.length, 1);
  assert.equal(islands[0]!.faces.length, 3);
  assert.equal(islands[0]!.area, 3);
});

test("roof islands: folded roof faces connect along their ridge", () => {
  const a: PolygonFace = { semanticType: "RoofSurface", rings: [[[0, 0, 2], [2, 0, 4], [2, 3, 4], [0, 3, 2]]] };
  const b: PolygonFace = { semanticType: "RoofSurface", rings: [[[2, 0, 4], [4, 0, 1], [4, 3, 1], [2, 3, 4]]] };
  const islands = findRoofIslands([a, b]);
  assert.equal(islands.length, 1);
  assert.equal(islands[0]!.minHeight, 1);
});

test("roof islands: partial shared edges connect despite different vertex subdivision", () => {
  const a = roof(0, 0, 4, 1);
  const b: PolygonFace = {
    semanticType: "RoofSurface",
    rings: [[[1, 1, 5], [2, 1, 5], [3, 1, 5], [3, 2, 5], [1, 2, 5]]],
  };
  const islands = findRoofIslands([a, b]);
  assert.equal(islands.length, 1);
  assert.equal(islands[0]!.area, 6);
});

test("roof islands: matching is independent of winding, closing vertices and coordinate origin", () => {
  const faces = [roof(0, 0, 1, 1), roof(1, 0, 2, 1)];
  faces[1]!.rings[0]!.reverse();
  faces[1]!.rings[0]!.push(faces[1]!.rings[0]![0]!);
  for (const face of faces) {
    face.rings = face.rings.map((ring) => ring.map(([x, y, z]): Vertex => [x + 728000, y + 5436000, z + 350]));
  }
  assert.equal(findRoofIslands(faces).length, 1);
});

test("roof islands: shared edge tolerance is 1 cm in 3D", () => {
  for (const gap of [0.005, 0.01, 0.011]) {
    const a = roof(0, 0, 1, 1);
    const beside = roof(1 + gap, 0, 2 + gap, 1);
    const above = roof(1, 0, 2, 1, 5 + gap);
    const expected = gap <= 0.01 ? 1 : 2;
    assert.equal(findRoofIslands([a, beside]).length, expected, `horizontal gap ${gap}`);
    assert.equal(findRoofIslands([a, above]).length, expected, `vertical gap ${gap}`);
  }
  assert.equal(findRoofIslands([roof(0, 0, 1, 1), roof(1.008, 0, 2.008, 1, 5.008)]).length, 2);
});

test("roof islands: point-only contact and crossing edges do not connect roofs", () => {
  assert.equal(findRoofIslands([roof(0, 0, 1, 1), roof(1, 1, 2, 2)]).length, 2);
  assert.equal(findRoofIslands([roof(0, 0, 4, 1), roof(1, -2, 2, 2)]).length, 2);
});

test("roof islands: vertically separated roofs are separate despite overlapping in XY", () => {
  assert.equal(findRoofIslands([roof(0, 0, 2, 2, 3), roof(0, 0, 2, 2, 5)]).length, 2);
});

test("roof islands: a wall cannot bridge separate roof islands", () => {
  const a = roof(0, 0, 1, 1, 3);
  const b = roof(1, 0, 2, 1, 5);
  const wall: PolygonFace = { semanticType: "WallSurface", rings: [[[1, 0, 3], [1, 1, 3], [1, 1, 5], [1, 0, 5]]] };
  assert.equal(findRoofIslands([a, wall, b]).length, 2);
});

test("roof islands: hole boundaries connect and holes are excluded from island area", () => {
  const surrounding = roof(0, 0, 4, 4);
  const infill = roof(1, 1, 3, 3);
  surrounding.rings.push(infill.rings[0]!.map((v): Vertex => [...v]));
  const islands = findRoofIslands([surrounding, infill]);
  assert.equal(islands.length, 1);
  assert.equal(islands[0]!.area, 16);
});

test("roof islands: degenerate roofs cannot create islands or bridges", () => {
  const degenerate: PolygonFace = { semanticType: "RoofSurface", rings: [[[0, 0, 0], [1, 0, 0], [2, 0, 0]]] };
  assert.deepEqual(findRoofIslands([degenerate]), []);
  assert.deepEqual(findRoofIslands([]), []);
});

test("roof islands: equal-area selection is deterministic", () => {
  const low = roof(0, 0, 1, 1, 3);
  const high = roof(10, 0, 11, 1, 5);
  assert.equal(findRoofIslands([low, high])[0]!.minHeight, 3);
  assert.equal(findRoofIslands([high, low])[0]!.minHeight, 3);
});
