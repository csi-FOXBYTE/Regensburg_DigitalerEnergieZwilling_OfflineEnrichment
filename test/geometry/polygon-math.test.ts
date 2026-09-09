import assert from "node:assert/strict";
import test from "node:test";

import { polygonArea, polygonAreaBelowHeight, wallFaceIntersectionArea, wallFaceIntersectionAreas } from "../../src/geometry/polygon-math.js";
import type { Vertex } from "../../src/shared/types.js";

const CONCAVE_U_RING: Vertex[] = [
  [0, 0, 0],
  [3, 0, 0],
  [3, 3, 0],
  [2, 3, 0],
  [2, 1, 0],
  [1, 1, 0],
  [1, 3, 0],
  [0, 3, 0],
];

// Building A's wall at X=1, outward normal pointing in +X
// Building B's wall at X=1, outward normal pointing in -X (reversed winding)
function wallA(yMin: number, yMax: number, zMin: number, zMax: number): Vertex[] {
  return [[1, yMin, zMin], [1, yMax, zMin], [1, yMax, zMax], [1, yMin, zMax]];
}
function wallB(yMin: number, yMax: number, zMin: number, zMax: number): Vertex[] {
  return [[1, yMax, zMin], [1, yMin, zMin], [1, yMin, zMax], [1, yMax, zMax]];
}

const EPSILON = 1e-9;

test("geometry/polygon-math: computes the area of a concave ring", () => {
  assert.ok(Math.abs(polygonArea([CONCAVE_U_RING]) - 7) < EPSILON);
});

test("geometry/polygon-math: polygon area is independent of ring winding", () => {
  assert.ok(Math.abs(polygonArea([[...CONCAVE_U_RING].reverse()]) - 7) < EPSILON);
});

test("geometry/polygon-math: subtracts inner-ring areas", () => {
  const outer: Vertex[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]];
  const hole: Vertex[] = [[1, 1, 0], [3, 1, 0], [3, 3, 0], [1, 3, 0]];

  assert.ok(Math.abs(polygonArea([outer, hole]) - 12) < EPSILON);
});

test("geometry/polygon-math: computes true 3D area of an inclined concave ring", () => {
  const inclined = CONCAVE_U_RING.map(([x, y]): Vertex => [x, y, x]);

  assert.ok(Math.abs(polygonArea([inclined]) - 7 * Math.sqrt(2)) < EPSILON);
});

test("geometry/polygon-math: cuts a gable wall at its eaves and through its triangle", () => {
  const gable: Vertex[] = [[0, 0, 0], [4, 0, 0], [4, 0, 2], [2, 0, 4], [0, 0, 2]];
  for (const ring of [gable, [...gable].reverse(), [...gable, gable[0]!]]) {
    assert.equal(polygonAreaBelowHeight([ring], 2), 8);
    assert.equal(polygonAreaBelowHeight([ring], 3), 11);
    assert.equal(polygonAreaBelowHeight([ring], 4), 12);
    assert.equal(polygonAreaBelowHeight([ring], 5), 12);
    assert.equal(polygonAreaBelowHeight([ring], 0), 0);
    assert.equal(polygonAreaBelowHeight([ring], -1), 0);
  }
});

test("geometry/polygon-math: subtracts the part of a hole below the cut", () => {
  const outer: Vertex[] = [[0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4]];
  const hole: Vertex[] = [[1, 0, 1], [3, 0, 1], [3, 0, 3], [1, 0, 3]];
  assert.equal(polygonAreaBelowHeight([outer, hole], 2), 6);
  assert.equal(polygonAreaBelowHeight([outer, hole], 4), 12);
});

test("geometry/polygon-math: a cut can leave disconnected parts of a concave wall", () => {
  const arch = CONCAVE_U_RING.map(([x, y]): Vertex => [x, 0, 3 - y]);
  assert.equal(polygonAreaBelowHeight([arch], 2), 4);
  assert.equal(polygonAreaBelowHeight([[...arch].reverse()], 2), 4);
});

test("geometry/polygon-math: height clipping keeps true 3D area for inclined surfaces", () => {
  const inclined: Vertex[] = [[0, 0, 0], [4, 0, 0], [4, 4, 4], [0, 4, 4]];
  assert.ok(Math.abs(polygonAreaBelowHeight([inclined], 2) - 8 * Math.sqrt(2)) < EPSILON);
});

test("geometry/polygon-math: fully overlapping wall faces return full area", () => {
  const area = wallFaceIntersectionArea(wallA(0, 1, 0, 3), wallB(0, 1, 0, 3));
  assert.ok(Math.abs(area - 3.0) < EPSILON, `Expected 3.0, got ${area}`);
});

test("geometry/polygon-math: partial Y overlap returns correct area", () => {
  // A covers Y=[0,1], B covers Y=[0.5,1.5] — overlap is Y=[0.5,1], height 3
  const area = wallFaceIntersectionArea(wallA(0, 1, 0, 3), wallB(0.5, 1.5, 0, 3));
  assert.ok(Math.abs(area - 1.5) < EPSILON, `Expected 1.5, got ${area}`);
});

test("geometry/polygon-math: partial Z overlap returns correct area", () => {
  // A covers Z=[0,3], B covers Z=[1,4] — overlap is Z=[1,3], width 1
  const area = wallFaceIntersectionArea(wallA(0, 1, 0, 3), wallB(0, 1, 1, 4));
  assert.ok(Math.abs(area - 2.0) < EPSILON, `Expected 2.0, got ${area}`);
});

test("geometry/polygon-math: non-overlapping Y ranges return zero", () => {
  const area = wallFaceIntersectionArea(wallA(0, 1, 0, 3), wallB(2, 3, 0, 3));
  assert.ok(area < EPSILON, `Expected 0, got ${area}`);
});

test("geometry/polygon-math: non-overlapping Z ranges return zero", () => {
  const area = wallFaceIntersectionArea(wallA(0, 1, 0, 1), wallB(0, 1, 2, 3));
  assert.ok(area < EPSILON, `Expected 0, got ${area}`);
});

test("geometry/polygon-math: result is symmetric regardless of which face is A or B", () => {
  const fA = wallA(0, 1, 0, 2);
  const fB = wallB(0.5, 1.5, 0.5, 2.5);
  const ab = wallFaceIntersectionArea(fA, fB);
  const ba = wallFaceIntersectionArea(fB, fA);
  assert.ok(Math.abs(ab - ba) < EPSILON, `Expected symmetry: ${ab} vs ${ba}`);
});

test("geometry/polygon-math: perpendicular walls touching along an edge have no shared area", () => {
  const a: Vertex[] = [[0, 0, 0], [0, 10, 0], [0, 10, 3], [0, 0, 3]];
  const b: Vertex[] = [[10, 0, 0], [0, 0, 0], [0, 0, 3], [10, 0, 3]];
  assert.equal(wallFaceIntersectionArea(a, b), 0);
  assert.equal(wallFaceIntersectionArea(b, a), 0);
});

test("geometry/polygon-math: coplanar walls touching only along an edge have no shared area", () => {
  assert.equal(wallFaceIntersectionArea(wallA(0, 1, 0, 3), wallB(1, 2, 0, 3)), 0);
});

test("geometry/polygon-math: walls with the same outward normal have no shared area", () => {
  assert.equal(wallFaceIntersectionArea(wallA(0, 1, 0, 3), wallA(0, 1, 0, 3)), 0);
});

test("geometry/polygon-math: separated parallel walls respect the distance tolerance", () => {
  const a = wallA(0, 1, 0, 3);
  const b = wallB(0, 1, 0, 3).map(([x, y, z]): Vertex => [x + 0.2, y, z]);
  assert.equal(wallFaceIntersectionArea(a, b), 0);
  assert.equal(wallFaceIntersectionArea(b, a), 0);
  assert.equal(wallFaceIntersectionArea(a, b, 0.3), 3);
  assert.equal(wallFaceIntersectionArea(b, a, 0.3), 3);
  assert.equal(wallFaceIntersectionArea(a, b, 0.2), 3);
});

test("geometry/polygon-math: accepts a small angular deviation but rejects more than one degree", () => {
  const a = wallA(0, 1, 0, 3);
  for (const degrees of [0.5, 1, 1.1, 2]) {
    const angle = degrees * Math.PI / 180;
    const b = wallB(0, 1, 0, 3).map(([, y, z]): Vertex => [1 - y * Math.sin(angle), y * Math.cos(angle), z]);
    const expected = degrees <= 1 ? 3 * Math.cos(angle / 2) : 0;
    assert.ok(Math.abs(wallFaceIntersectionArea(a, b) - expected) < EPSILON, `${degrees} degrees`);
    assert.ok(Math.abs(wallFaceIntersectionArea(b, a) - expected) < EPSILON, `${degrees} degrees reversed`);
  }
});

test("geometry/polygon-math: near-parallel walls diverging beyond tolerance have no shared area", () => {
  const a = wallA(0, 40, 0, 3);
  const angle = 0.5 * Math.PI / 180;
  const b = wallB(0, 40, 0, 3).map(([, y, z]): Vertex => [1 - y * Math.sin(angle), y * Math.cos(angle), z]);
  assert.equal(wallFaceIntersectionArea(a, b), 0);
  assert.equal(wallFaceIntersectionArea(b, a), 0);
});

test("geometry/polygon-math: staggered overlap remains accurate at large CRS coordinates", () => {
  const translate = ([x, y, z]: Vertex): Vertex => [x + 720000, y + 5432000, z + 350];
  const a = wallA(0, 4, 0, 1).map(translate);
  const b = wallB(2, 6, 0, 1).map(translate);
  assert.equal(wallFaceIntersectionArea(a, b), 2);
  assert.equal(wallFaceIntersectionArea(b, a), 2);
});

test("geometry/polygon-math: splits actual overlap at each absolute eave elevation", () => {
  const translate = ([x, y, z]: Vertex): Vertex => [x + 720000, y + 5432000, z + 350];
  const a = [wallA(0, 4, 0, 4).map(translate)];
  const b = [wallB(0, 4, 1, 3).map(translate)];
  for (const [height, below] of [[350, 0], [351, 0], [352, 4], [353, 8], [354, 8]]) {
    assert.deepEqual(wallFaceIntersectionAreas(a, b, 0.15, height, 352.5), {
      area: 8, belowA: below, belowB: 6,
    });
    assert.deepEqual(wallFaceIntersectionAreas(b, a, 0.15, 352.5, height), {
      area: 8, belowA: 6, belowB: below,
    });
  }
  assert.deepEqual(wallFaceIntersectionAreas(a, b, 0.15, null, 352), { area: 8, belowA: null, belowB: 4 });
});

test("geometry/polygon-math: subtracts overlapping holes once and splits them at the eaves", () => {
  // Outer overlap is 16. Holes overlap over 2, so their union removes 6.
  const a = [wallA(0, 4, 0, 4), wallA(1, 3, 1, 3)];
  const b = [wallB(0, 4, 0, 4), wallB(2, 3, 0, 4)];
  for (const holeA of [a[1]!, [...a[1]!].reverse()]) {
    const result = wallFaceIntersectionAreas([a[0]!, holeA], b, 0.15, 2, 3);
    assert.deepEqual(result, { area: 10, belowA: 5, belowB: 7 });
    assert.deepEqual(wallFaceIntersectionAreas(b, [a[0]!, holeA], 0.15, 3, 2), {
      area: 10, belowA: 7, belowB: 5,
    });
  }
});

test("geometry/polygon-math: concave walls can have disconnected shared portions", () => {
  const arch = CONCAVE_U_RING.map(([x, y]): Vertex => [1, x, 3 - y]).reverse();
  const rectangle = wallB(0, 3, 0, 2);
  assert.deepEqual(wallFaceIntersectionAreas([arch], [rectangle], 0.15, 1, 2), {
    area: 4, belowA: 2, belowB: 4,
  });
  assert.deepEqual(wallFaceIntersectionAreas([rectangle], [arch], 0.15, 2, 1), {
    area: 4, belowA: 4, belowB: 2,
  });
  assert.deepEqual(wallFaceIntersectionAreas([arch], [[...arch].reverse()], 0.15, 2, 3), {
    area: 7, belowA: 4, belowB: 7,
  });
});

test("geometry/polygon-math: eave rounding does not leave a shared attic strip", () => {
  assert.deepEqual(wallFaceIntersectionAreas([wallA(0, 1, 0, 3)], [wallB(0, 1, 0, 3)], 0.15, 3 - 1e-10, 3), {
    area: 3, belowA: 3, belowB: 3,
  });
});

test("geometry/polygon-math: inclined walls split on their own source planes", () => {
  const a = [wallA(0, 2, 0, 3).map(([x, y, z]): Vertex => [x + 0.1 * z, y, z])];
  const b = [wallB(0, 2, 0, 3).map(([x, y, z]): Vertex => [x + 0.1 * z + 0.1, y, z])];
  const ab = wallFaceIntersectionAreas(a, b, 0.15, 1, 1);
  const ba = wallFaceIntersectionAreas(b, a, 0.15, 1, 1);
  // Projection shifts the lower end of A's overlap upward by 0.1 * 0.1 / 1.01.
  const scale = 2 * Math.sqrt(1.01);
  assert.ok(Math.abs(ab.belowA! - (1 - 0.01 / 1.01) * scale) < EPSILON);
  assert.ok(Math.abs(ab.belowB! - scale) < EPSILON);
  assert.ok(Math.abs(ab.belowA! - ba.belowB!) < EPSILON);
  assert.ok(Math.abs(ab.belowB! - ba.belowA!) < EPSILON);
});
