import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

/** `count` 1 m cube buildings stacked at the same place, shifted by `offsetX`. */
function stackedCubes(marker: string, count: number, offsetX = 0) {
  const template = cube(marker).CityObjects[`B-${marker}`]!;
  const cityObjects = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`B-${marker}-${i}`, structuredClone(template)]),
  );
  return cube(marker, {
    CityObjects: cityObjects,
    transform: { scale: [1, 1, 1], translate: [offsetX, 0, 0] },
  });
}

test("analysis/hardening: files whose walls exceed the adjacency budget are skipped and leave no adjacencies", async () => {
  await withDirs(async (src, out) => {
    // "ok" shares its west wall with the stacked cubes.
    await put(join(src, "ok.json"), stackedCubes("ok", 1, 1));
    await put(join(src, "stacked.json"), stackedCubes("stacked", 20));

    const unlimited = await processCityJsonFiles(src, { ...options, outDir: out, adjacency: true });
    assert.ok(unlimited.files.every((file) => file.status === "analyzed"));
    const adjacentBefore = JSON.parse(await readFile(join(out, "ok.json"), "utf8"));
    assert.equal(JSON.parse(adjacentBefore.CityObjects["B-ok-0"].attributes.digitalEnergyTwin.adjacentBuildings).length, 20);

    const limited = await processCityJsonFiles(src, {
      ...options,
      outDir: out,
      adjacency: true,
      limits: { maxAdjacencyPairs: 100 },
    });
    const byName = Object.fromEntries(limited.files.map((file) => [relative(src, file.filePath), file]));
    assert.equal(byName["ok.json"]?.status, "analyzed");
    assert.equal(byName["stacked.json"]?.status, "skipped");
    assert.match(byName["stacked.json"]?.reason ?? "", /more than 100 candidate wall pairs for the adjacency pass \(limit 100\)/);
    const adjacentAfter = JSON.parse(await readFile(join(out, "ok.json"), "utf8"));
    assert.equal(adjacentAfter.CityObjects["B-ok-0"].attributes.digitalEnergyTwin.adjacentBuildings, "[]");
  });
});

test("analysis/hardening: the adjacency budget counts pairs exactly and bounds the vertex-count products", async () => {
  await withDirs(async (src, out) => {
    // The four walls of one cube touch their two neighbours: 4 pairs of 4x4 vertices.
    await put(join(src, "cube.json"), cube("cube"));
    const run = (limits: Record<string, number>) =>
      processCityJsonFiles(src, { ...options, outDir: out, adjacency: true, limits });

    assert.equal((await run({ maxAdjacencyPairs: 4, maxAdjacencyVertexProducts: 64 })).files[0]?.status, "analyzed");
    assert.match((await run({ maxAdjacencyPairs: 3 })).files[0]?.reason ?? "", /more than 3 candidate wall pairs/);
    assert.match(
      (await run({ maxAdjacencyVertexProducts: 63 })).files[0]?.reason ?? "",
      /exceed 63 summed vertex-count products \(limit 63\)/,
    );
  });
});
