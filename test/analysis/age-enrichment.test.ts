import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";
import { isObject } from "../../src/shared/guards.js";

const FIXTURE_DIR = join(process.cwd(), "test", "data");
const GPKG_PATH = join(FIXTURE_DIR, "Baualtersklassen.gpkg");

test("age enrichment: writes constructionYear into digitalEnergyTwin for buildings inside a zone", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "age-enrich-"));

  try {
    const result = await processCityJsonFiles(FIXTURE_DIR, {
      outDir: tmpDir,
      sourceCrsFallback: "EPSG:25832",
      ageZonesFile: GPKG_PATH,
    });

    const analyzed = result.files.filter((f) => f.status === "analyzed");
    assert.ok(analyzed.length > 0, "expected at least one analyzed file");

    let enrichedCount = 0;

    for (const file of analyzed) {
      const raw = await readFile(join(tmpDir, basename(file.filePath)), "utf-8");
      const parsed = JSON.parse(raw) as { CityObjects: Record<string, unknown> };

      for (const cityObject of Object.values(parsed.CityObjects)) {
        if (!isObject(cityObject)) continue;
        const det = isObject(cityObject.attributes) && isObject((cityObject.attributes as Record<string, unknown>).digitalEnergyTwin)
          ? (cityObject.attributes as Record<string, unknown>).digitalEnergyTwin as Record<string, unknown>
          : null;
        if (!det || !("constructionYear" in det)) continue;

        const year = det.constructionYear;
        assert.ok(
          year === null || (typeof year === "number" && year >= 1919 && year <= 2019),
          `unexpected constructionYear value: ${String(year)}`,
        );
        enrichedCount++;
      }
    }

    assert.ok(enrichedCount > 0, "expected at least one building enriched with constructionYear");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("age enrichment: constructionYear is absent when ageZonesFile is not set", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "age-enrich-"));

  try {
    const result = await processCityJsonFiles(FIXTURE_DIR, {
      outDir: tmpDir,
      sourceCrsFallback: "EPSG:25832",
    });

    const analyzed = result.files.filter((f) => f.status === "analyzed");
    assert.ok(analyzed.length > 0);

    for (const file of analyzed) {
      const raw = await readFile(join(tmpDir, basename(file.filePath)), "utf-8");
      const parsed = JSON.parse(raw) as { CityObjects: Record<string, unknown> };

      for (const cityObject of Object.values(parsed.CityObjects)) {
        if (!isObject(cityObject)) continue;
        const det = isObject(cityObject.attributes) && isObject((cityObject.attributes as Record<string, unknown>).digitalEnergyTwin)
          ? (cityObject.attributes as Record<string, unknown>).digitalEnergyTwin as Record<string, unknown>
          : null;
        if (!det) continue;

        assert.ok(!("constructionYear" in det), "constructionYear should be absent without ageZonesFile");
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
