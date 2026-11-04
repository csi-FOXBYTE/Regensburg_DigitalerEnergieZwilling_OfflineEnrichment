import assert from "node:assert/strict";
import { join, relative } from "node:path";
import test from "node:test";

import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";
import { cube, listFiles, options, put, withDirs } from "./hardening-helpers.js";

test("analysis/hardening: skips files that exceed the processing limits", async () => {
  await withDirs(async (src, out) => {
    await put(join(src, "big.json"), `${JSON.stringify(cube("big"))}${" ".repeat(4096)}`);
    await put(join(src, "deep.json"), cube("deep", { padding: JSON.parse("[".repeat(50) + "]".repeat(50)) }));
    await put(
      join(src, "objects.json"),
      cube("objects", { CityObjects: { ...cube("x").CityObjects, ...cube("y").CityObjects } }),
    );
    await put(join(src, "vertices.json"), cube("vertices", { vertices: [...cube("v").vertices, [9, 9, 9]] }));
    await put(join(src, "ok.json"), cube("ok"));

    const result = await processCityJsonFiles(src, {
      ...options,
      outDir: out,
      limits: { maxFileBytes: 2048, maxNestingDepth: 32, maxCityObjects: 1, maxVertices: 8 },
    });

    const byName = Object.fromEntries(result.files.map((file) => [relative(src, file.filePath), file]));
    assert.equal(byName["ok.json"]?.status, "analyzed");
    assert.match(byName["big.json"]?.reason ?? "", /bytes \(limit 2048\)/);
    assert.match(byName["deep.json"]?.reason ?? "", /nesting exceeds depth 32/);
    assert.match(byName["objects.json"]?.reason ?? "", /2 CityObjects \(limit 1\)/);
    assert.match(byName["vertices.json"]?.reason ?? "", /9 vertices \(limit 8\)/);
    assert.deepEqual(await listFiles(out), ["ok.json"]);
  });
});

test("analysis/hardening: semantically invalid files are skipped instead of producing null metrics", async () => {
  await withDirs(async (src, out) => {
    const infiniteVertex = JSON.stringify(cube("inf")).replace('"vertices":[[0,0,0]', '"vertices":[[1e999,0,0]');
    await put(join(src, "inf-vertex.json"), infiniteVertex);
    await put(join(src, "inf-scale.json"), JSON.stringify(cube("scale")).replace('"scale":[1,1,1]', '"scale":[1e999,1,1]'));
    await put(join(src, "v99.json"), cube("v99", { version: "99.0" }));
    await put(join(src, "bad-index.json"), JSON.stringify(cube("idx")).replace("[[0,3,2,1]]", "[[0,3,2,99]]"));
    const overflow = cube("overflow", { transform: { scale: [1e308, 1, 1], translate: [0, 0, 0] } });
    overflow.vertices[1] = [10, 0, 0];
    await put(join(src, "overflow.json"), overflow);

    const result = await processCityJsonFiles(src, { ...options, outDir: out, adjacency: true });

    const reasons = Object.fromEntries(result.files.map((file) => [relative(src, file.filePath), file.reason ?? file.status]));
    assert.deepEqual(Object.keys(reasons).sort(), ["bad-index.json", "inf-scale.json", "inf-vertex.json", "overflow.json", "v99.json"]);
    assert.match(reasons["inf-vertex.json"]!, /Vertex 0 has a non-finite coordinate/);
    assert.match(reasons["inf-scale.json"]!, /transform/);
    assert.match(reasons["v99.json"]!, /Unsupported CityJSON version "99.0"/);
    assert.match(reasons["bad-index.json"]!, /Invalid vertex index 99/);
    assert.match(reasons["overflow.json"]!, /non-finite coordinates/);
    assert.ok(result.files.every((file) => file.status === "skipped"));
    assert.deepEqual(await listFiles(out), []);
  });
});
