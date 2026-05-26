import assert from "node:assert/strict";
import test from "node:test";

import { wallFaceIntersectionArea } from "../../src/geometry/polygon-math.js";
import type { Vertex } from "../../src/shared/types.js";

// Building A's wall at X=1, outward normal pointing in +X
// Building B's wall at X=1, outward normal pointing in -X (reversed winding)
function wallA(yMin: number, yMax: number, zMin: number, zMax: number): Vertex[] {
  return [[1, yMin, zMin], [1, yMax, zMin], [1, yMax, zMax], [1, yMin, zMax]];
}
function wallB(yMin: number, yMax: number, zMin: number, zMax: number): Vertex[] {
  return [[1, yMax, zMin], [1, yMin, zMin], [1, yMin, zMax], [1, yMax, zMax]];
}

const EPSILON = 1e-9;

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
