import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRunResult } from "../src/cli-report.js";
import type { CityJsonAnalysisResult } from "../src/shared/types.js";

function result(statuses: Array<"analyzed" | "skipped">): CityJsonAnalysisResult {
  return {
    files: statuses.map((status, i) => ({ filePath: `/data/f${i}.json`, status })),
  };
}

test("cli-report: empty input fails", () => {
  const report = evaluateRunResult(result([]));
  assert.equal(report.exitCode, 1);
  assert.equal(report.total, 0);
});

test("cli-report: all files skipped fails", () => {
  const report = evaluateRunResult(result(["skipped", "skipped"]));
  assert.equal(report.exitCode, 1);
  assert.equal(report.analyzed, 0);
  assert.equal(report.skipped, 2);
});

test("cli-report: at least one analyzed succeeds by default", () => {
  const report = evaluateRunResult(result(["analyzed", "skipped"]));
  assert.equal(report.exitCode, 0);
  assert.equal(report.analyzed, 1);
  assert.equal(report.skipped, 1);
});

test("cli-report: strict mode fails when any file is skipped", () => {
  const report = evaluateRunResult(result(["analyzed", "skipped"]), true);
  assert.equal(report.exitCode, 1);
});

test("cli-report: strict mode passes when nothing is skipped", () => {
  const report = evaluateRunResult(result(["analyzed", "analyzed"]), true);
  assert.equal(report.exitCode, 0);
});
