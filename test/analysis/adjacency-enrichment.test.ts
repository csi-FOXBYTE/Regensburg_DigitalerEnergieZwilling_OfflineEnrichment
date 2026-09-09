import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";
import type { AdjacencyResult } from "../../src/db/spatial-database.js";
import type { Vertex } from "../../src/shared/types.js";

function buildingTile(id: string, eaves: number, side: number, roof = true, ground = true) {
  const wall: Vertex[] = [[0, 0, 0], [0, 4, 0], [0, 4, eaves], [0, 2, eaves + 2], [0, 0, eaves]];
  if (side > 0) wall.reverse();
  const faces: { type: string; ring: Vertex[] }[] = [{ type: "WallSurface", ring: wall }];
  if (roof) {
    faces.push({
      type: "RoofSurface",
      ring: [[0, 0, eaves], [side * 4, 0, eaves], [side * 4, 2, eaves + 2], [0, 2, eaves + 2]],
    });
    // This smaller detached canopy must not set the split elevation.
    faces.push({ type: "RoofSurface", ring: [[10, 10, 0.5], [11, 10, 0.5], [11, 11, 0.5], [10, 11, 0.5]] });
  }
  if (ground) {
    faces.push({ type: "GroundSurface", ring: [[0, 0, 0], [0, 4, 0], [side * 4, 4, 0], [side * 4, 0, 0]] });
  }
  const vertices: Vertex[] = [];
  const boundaries = faces.map(({ ring }) => [ring.map((vertex) => {
    vertices.push(vertex);
    return vertices.length - 1;
  })]);
  return {
    type: "CityJSON",
    version: "2.0",
    transform: { scale: [1, 1, 1], translate: [720000, 5432000, 350] },
    CityObjects: {
      [id]: {
        type: "Building",
        attributes: { NiedrigsteTraufeDesGebaeudes: "350.5" },
        geometry: [{
          type: "MultiSurface", lod: "2", boundaries,
          semantics: { surfaces: faces.map(({ type }) => ({ type })), values: faces.map((_, i) => i) },
        }],
      },
    },
    vertices,
  };
}

async function readEnrichment(path: string, id: string) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const det = parsed.CityObjects[id].attributes.digitalEnergyTwin;
  assert.equal(typeof det.adjacentBuildings, "string");
  return { det, adjacencies: JSON.parse(det.adjacentBuildings) as AdjacencyResult[] };
}

test("analysis/adjacency: exports different eave splits across files and refreshes isolated buildings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "det-adjacency-"));
  try {
    const pathA = join(dir, "a.json");
    const pathB = join(dir, "b.json");
    await writeFile(pathA, JSON.stringify(buildingTile("a", 2, -1)));
    await writeFile(pathB, JSON.stringify(buildingTile("b", 3, 1)));
    const options = { adjacency: true, sourceCrsFallback: "EPSG:25832" };
    const result = await processCityJsonFiles(dir, options);
    assert.equal(result.files.length, 2);
    assert.ok(result.files.every((file) => file.status === "analyzed"));
    const a = await readEnrichment(pathA, "a");
    const b = await readEnrichment(pathB, "b");
    assert.deepEqual(a.adjacencies, [{
      buildingId: "b", sharedWallArea: 12, sharedWallAreaWithoutAttic: 8, sharedWallAreaAttic: 4,
    }]);
    assert.deepEqual(b.adjacencies, [{
      buildingId: "a", sharedWallArea: 12, sharedWallAreaWithoutAttic: 11, sharedWallAreaAttic: 1,
    }]);
    assert.equal(a.det.lowestEavesHeight, 2);
    assert.equal(b.det.lowestEavesHeight, 3);
    assert.equal(a.det.grossExternalWallAreaWithoutAttic - a.adjacencies[0]!.sharedWallAreaWithoutAttic!, 0);
    assert.equal(b.det.grossExternalWallAreaWithoutAttic - b.adjacencies[0]!.sharedWallAreaWithoutAttic!, 1);

    // Reprocessing after a geometry change must clear both old adjacency entries.
    const moved = JSON.parse(await readFile(pathB, "utf8"));
    moved.transform.translate[0] += 100;
    await writeFile(pathB, JSON.stringify(moved));
    const rerun = await processCityJsonFiles(dir, options);
    assert.ok(rerun.files.every((file) => file.status === "analyzed"));
    assert.deepEqual((await readEnrichment(pathA, "a")).adjacencies, []);
    assert.deepEqual((await readEnrichment(pathB, "b")).adjacencies, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("analysis/adjacency: a missing roof only makes its owner's split unknown; ground is not required", async () => {
  const dir = await mkdtemp(join(tmpdir(), "det-adjacency-unknown-"));
  try {
    const pathA = join(dir, "a.json");
    const pathB = join(dir, "b.json");
    await writeFile(pathA, JSON.stringify(buildingTile("a", 2, -1, false)));
    await writeFile(pathB, JSON.stringify(buildingTile("b", 3, 1, true, false)));
    const result = await processCityJsonFiles(dir, { adjacency: true, sourceCrsFallback: "EPSG:25832" });
    assert.ok(result.files.every((file) => file.status === "analyzed"));
    const a = await readEnrichment(pathA, "a");
    const b = await readEnrichment(pathB, "b");
    assert.equal(a.det.grossExternalWallAreaWithoutAttic, null);
    assert.deepEqual(a.adjacencies, [{
      buildingId: "b", sharedWallArea: 12, sharedWallAreaWithoutAttic: null, sharedWallAreaAttic: null,
    }]);
    assert.equal(b.det.lowestEavesHeight, null);
    assert.deepEqual(b.adjacencies, [{
      buildingId: "a", sharedWallArea: 12, sharedWallAreaWithoutAttic: 11, sharedWallAreaAttic: 1,
    }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
