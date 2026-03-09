import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import { isCityJsonLike } from "../src/validation/cityjson.js";
import { isObject } from "../src/shared/guards.js";

const execFileAsync = promisify(execFile);

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

async function hasDocker(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["version"]);
    return true;
  } catch {
    return false;
  }
}

test("docker e2e: image runs CLI and enriches mounted CityJSON files", async (t) => {
  if (process.env.RUN_DOCKER_E2E !== "1") {
    t.skip("Set RUN_DOCKER_E2E=1 to run Docker end-to-end tests.");
    return;
  }

  const dockerAvailable = await hasDocker();
  if (!dockerAvailable) {
    t.skip("Docker is not available in this environment.");
    return;
  }

  const fixtureDir = join(process.cwd(), "test", "data");
  const dockerfilePath = join(process.cwd(), "Dockerfile");
  const tmpRoot = await mkdtemp(join(tmpdir(), "det-docker-e2e-"));
  const tmpDataDir = join(tmpRoot, "data");
  const imageTag = `det-offline-enrichment-e2e:${Date.now()}-${process.pid}`;

  try {
    await access(dockerfilePath);
    await cp(fixtureDir, tmpDataDir, { recursive: true });

    await execFileAsync("docker", ["build", "--file", dockerfilePath, "-t", imageTag, "."]);

    const runResult = await execFileAsync("docker", [
      "run",
      "--rm",
      "-v",
      `${tmpDataDir}:/data`,
      "-e",
      "SOURCE_CRS_FALLBACK=EPSG:25832",
      imageTag,
    ]);

    const parsedRunResult = JSON.parse(runResult.stdout) as unknown;
    assert.ok(isObject(parsedRunResult), "Expected JSON result from CLI");
    assert.ok(Array.isArray(parsedRunResult.files), "Expected 'files' array in CLI result");
    assert.ok(parsedRunResult.files.length > 0, "Expected at least one processed file");

    const outputFiles = (await readdir(tmpDataDir)).filter((file) => file.endsWith(".json"));
    assert.ok(outputFiles.length > 0, "Expected JSON files in mounted output directory");

    for (const file of outputFiles) {
      const raw = await readFile(join(tmpDataDir, file), "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isCityJsonLike(parsed)) {
        continue;
      }

      for (const [id, cityObject] of Object.entries(parsed.CityObjects)) {
        if (!isObject(cityObject) || cityObject.type !== "Building") {
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
        }
      }
    }
  } finally {
    await execFileAsync("docker", ["rmi", imageTag]).catch(() => undefined);
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
