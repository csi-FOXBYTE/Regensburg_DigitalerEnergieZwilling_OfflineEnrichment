import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
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

test("discovery/list-json-files: skips symlinks that escape the source directory", async () => {
  const base = await mkdtemp(join(tmpdir(), "det-discovery-sym-"));
  const outside = await mkdtemp(join(tmpdir(), "det-discovery-out-"));

  try {
    const src = join(base, "src");
    await mkdir(src, { recursive: true });

    const real = join(src, "real.json");
    await writeFile(real, "{}", "utf-8");

    // A *.json symlink pointing at a file outside the source directory.
    const secret = join(outside, "secret.json");
    await writeFile(secret, "{}", "utf-8");
    await symlink(secret, join(src, "linked.json"));

    // A symlinked directory pointing outside, containing a *.json file.
    const escaped = join(src, "escaped");
    await symlink(outside, escaped);

    const files = await listJsonFiles(src);
    assert.deepEqual(files, [real], "only the real in-tree file is returned");
  } finally {
    await rm(base, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
