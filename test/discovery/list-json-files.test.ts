import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listJsonFiles } from "../../src/discovery/list-json-files.js";

test("discovery/list-json-files: returns only JSON files recursively", async () => {
  const dir = await mkdtemp(join(tmpdir(), "det-discovery-"));

  try {
    await mkdir(join(dir, "nested"), { recursive: true });
    const fileA = join(dir, "a.json");
    const fileB = join(dir, "nested", "b.json");

    await writeFile(fileA, "{}", "utf-8");
    await writeFile(fileB, "{}", "utf-8");
    await writeFile(join(dir, "ignore.txt"), "x", "utf-8");

    const files = (await listJsonFiles(dir)).sort();
    assert.deepEqual(files, [fileA, fileB].sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
