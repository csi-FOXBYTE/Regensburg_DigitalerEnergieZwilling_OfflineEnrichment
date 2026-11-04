import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROCESSING_LIMITS,
  exceedsJsonNestingDepth,
  resolveProcessingLimits,
} from "../../src/validation/limits.js";

test("validation/limits: defaults apply and overrides replace single limits", () => {
  assert.deepEqual(resolveProcessingLimits(), DEFAULT_PROCESSING_LIMITS);
  const limits = resolveProcessingLimits({ maxVertices: 10, maxRingVertices: undefined });
  assert.equal(limits.maxVertices, 10);
  assert.equal(limits.maxRingVertices, DEFAULT_PROCESSING_LIMITS.maxRingVertices);
});

test("validation/limits: rejects limits that are not positive integers", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => resolveProcessingLimits({ maxFileBytes: value }), /Invalid processing limit maxFileBytes/);
  }
});

test("validation/limits: measures nesting depth on raw JSON text", () => {
  assert.equal(exceedsJsonNestingDepth('{"a":[[1]]}', 3), false);
  assert.equal(exceedsJsonNestingDepth('{"a":[[[1]]]}', 3), true);
  assert.equal(exceedsJsonNestingDepth("[".repeat(100_000) + "]".repeat(100_000), 32), true);
});

test("validation/limits: ignores brackets inside strings, including escaped quotes", () => {
  assert.equal(exceedsJsonNestingDepth('{"a":"[[[[{{{{"}', 1), false);
  assert.equal(exceedsJsonNestingDepth('{"a":"\\"[[[[\\\\"}', 1), false);
  assert.equal(exceedsJsonNestingDepth('{"a":"\\\\",  "b":[[1]]}', 2), true);
});
