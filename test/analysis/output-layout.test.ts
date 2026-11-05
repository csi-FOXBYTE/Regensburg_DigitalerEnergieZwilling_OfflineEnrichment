import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";

import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";
import { cube, listFiles, options, put, withDirs } from "./hardening-helpers.js";

test("analysis/hardening: preserves subdirectories so equal file names do not overwrite each other", async () => {
  await withDirs(async (src, out) => {
    await put(join(src, "a", "same.json"), cube("a"));
    await put(join(src, "b", "same.json"), cube("b"));
    await put(join(src, "top.json"), cube("top"));

    const result = await processCityJsonFiles(src, { ...options, outDir: out });

    assert.deepEqual(result.files.map((file) => file.status), ["analyzed", "analyzed", "analyzed"]);
    assert.deepEqual(await listFiles(out), [join("a", "same.json"), join("b", "same.json"), "top.json"]);
    for (const marker of ["a", "b"]) {
      const written = JSON.parse(await readFile(join(out, marker, "same.json"), "utf-8")) as {
        CityObjects: Record<string, { attributes: { marker: string; digitalEnergyTwin?: unknown } }>;
      };
      assert.equal(written.CityObjects[`B-${marker}`]?.attributes.marker, marker);
      assert.ok(written.CityObjects[`B-${marker}`]?.attributes.digitalEnergyTwin);
    }
  });
});

test("analysis/hardening: fails the run when output paths still collide", async () => {
  await withDirs(async (src, out) => {
    await put(join(src, "Tile.json"), cube("upper"));
    await put(join(src, "tile.json"), cube("lower"));

    await assert.rejects(
      processCityJsonFiles(src, { ...options, outDir: out }),
      /Output path collision/,
    );
    assert.deepEqual(await listFiles(out), []);
  });
});

test("analysis/hardening: an output directory inside the source directory is not read back", async () => {
  await withDirs(async (src) => {
    const out = join(src, "output");
    await put(join(src, "tile.json"), cube("tile"));
    await put(join(out, "stale.json"), cube("stale"));

    const result = await processCityJsonFiles(src, { ...options, outDir: out });

    assert.deepEqual(result.files.map((file) => relative(src, file.filePath)), ["tile.json"]);
    assert.deepEqual(await listFiles(out), ["stale.json", "tile.json"]);
  });
});
