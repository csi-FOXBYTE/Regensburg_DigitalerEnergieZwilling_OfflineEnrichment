import assert from "node:assert/strict";
import test from "node:test";

import { isObject, isVertex } from "../../src/shared/guards.js";

test("shared/guards: isObject returns expected values", () => {
  assert.equal(isObject({}), true);
  assert.equal(isObject([]), true);
  assert.equal(isObject(null), false);
  assert.equal(isObject("x"), false);
});

test("shared/guards: isVertex validates 3D number tuples", () => {
  assert.equal(isVertex([1, 2, 3]), true);
  assert.equal(isVertex([1, 2]), false);
  assert.equal(isVertex([1, 2, "3"]), false);
  assert.equal(isVertex("not-a-vertex"), false);
});
