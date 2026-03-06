import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";

function createSampleCityJson() {
  return {
    type: "CityJSON",
    version: "2.0",
    transform: {
      scale: [1, 1, 1],
      translate: [0, 0, 0],
    },
    CityObjects: {
      b1: {
        type: "Building",
        geometry: [
          {
            type: "Solid",
            lod: "2.0",
            boundaries: [
              [
                [[0, 3, 2, 1]],
                [[4, 5, 6, 7]],
                [[0, 1, 5, 4]],
                [[1, 2, 6, 5]],
                [[2, 3, 7, 6]],
                [[3, 0, 4, 7]],
              ],
            ],
            semantics: {
              surfaces: [
                { type: "GroundSurface" },
                { type: "RoofSurface" },
                { type: "WallSurface" },
              ],
              values: [[0, 1, 2, 2, 2, 2]],
            },
          },
        ],
      },
    },
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  };
}

test("analysis/file-analyzer: enriches and writes digitalEnergyTwin attributes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "det-analysis-"));

  try {
    const filePath = join(dir, "sample.json");
    await writeFile(filePath, `${JSON.stringify(createSampleCityJson(), null, 2)}\n`, "utf-8");

    const result = await processCityJsonFiles(dir, {
      sourceCrsFallback: "EPSG:25832",
    });

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.status, "analyzed");

    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      CityObjects: Record<string, { attributes?: Record<string, unknown> }>;
    };

    const enriched = parsed.CityObjects.b1?.attributes?.digitalEnergyTwin as Record<string, unknown> | undefined;

    assert.ok(enriched);
    assert.equal(typeof enriched?.volume, "number");
    assert.equal(typeof enriched?.groundArea, "number");
    assert.equal(typeof enriched?.envelopeArea, "number");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
