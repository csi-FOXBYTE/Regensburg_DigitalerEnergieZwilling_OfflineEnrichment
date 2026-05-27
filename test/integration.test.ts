import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processCityJsonFiles } from "../src/analysis/file-analyzer.js";
import { isCityJsonLike } from "../src/validation/cityjson.js";
import { isObject } from "../src/shared/guards.js";

const EXPECTED_METRIC_KEYS = [
    "volume",
    "groundArea",
    "upperFloorArea",
    "grossExternalWallArea",
    "roofArea",
    "roofPitchDegrees",
    "height",
    "envelopeArea",
] as const;

test("integration: enriches copied CityJSON files and validates output", async () => {
    const fixtureDir = join(process.cwd(), "test");
    const tmpRoot = await mkdtemp(join(tmpdir(), "det-integration-"));
    const tmpDataDir = join(tmpRoot, "data");

    try {
        await cp(fixtureDir, tmpDataDir, { recursive: true });

        const result = await processCityJsonFiles(tmpDataDir, {
            sourceCrsFallback: "EPSG:25832",
        });

        const analyzed = result.files.filter((file) => file.status === "analyzed");
        assert.ok(analyzed.length > 0, "Expected at least one analyzed file");

        for (const file of analyzed) {
            const raw = await readFile(file.filePath, "utf-8");
            const parsed = JSON.parse(raw) as unknown;

            assert.equal(isCityJsonLike(parsed), true, `Expected valid CityJSON for ${file.filePath}`);
            if (!isCityJsonLike(parsed)) {
                continue;
            }

            const expectedBuildingIds = new Set((file.buildings ?? []).map((building) => building.buildingId));

            for (const [id, cityObject] of Object.entries(parsed.CityObjects)) {
                if (!expectedBuildingIds.has(id)) {
                    continue;
                }

                assert.ok(isObject(cityObject), `Expected object for CityObject '${id}'`);
                if (!isObject(cityObject)) {
                    continue;
                }

                const attributes = isObject(cityObject.attributes) ? cityObject.attributes : null;
                assert.ok(attributes, `Missing attributes for '${id}'`);

                const det = attributes && isObject(attributes.digitalEnergyTwin) ? attributes.digitalEnergyTwin : null;
                assert.ok(det, `Missing attributes.digitalEnergyTwin for '${id}'`);

                if (!det) {
                    continue;
                }

                for (const key of EXPECTED_METRIC_KEYS) {
                    assert.ok(key in det, `Missing '${key}' in digitalEnergyTwin for '${id}'`);

                    const value: unknown = det[key];
                    if (key === "roofPitchDegrees" || key === "height") {
                        assert.ok(
                            typeof value === "number" || value === null,
                            `Expected number|null for '${key}' in '${id}'`,
                        );
                    } else {
                        assert.equal(typeof value, "number", `Expected number for '${key}' in '${id}'`);
                    }
                }
            }
        }

        const sourceFiles = (await readdir(fixtureDir)).filter((name) => name.endsWith(".json")).sort();
        const copiedFiles = (await readdir(tmpDataDir)).filter((name) => name.endsWith(".json")).sort();
        assert.deepEqual(copiedFiles, sourceFiles);
    } finally {
        await rm(tmpRoot, { recursive: true, force: true });
    }
});
