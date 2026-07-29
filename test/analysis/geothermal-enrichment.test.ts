import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";
import { isObject } from "../../src/shared/guards.js";

const FIXTURE_PATH = join(process.cwd(), "test", "data", "720_5432.json");

function multipolygonWkb(points: [number, number][]): Buffer {
  const buffer = Buffer.alloc(9 + 9 + 4 + points.length * 16);
  let offset = 0;

  buffer.writeUInt8(1, offset);
  offset += 1;
  buffer.writeUInt32LE(6, offset);
  offset += 4;
  buffer.writeUInt32LE(1, offset);
  offset += 4;

  buffer.writeUInt8(1, offset);
  offset += 1;
  buffer.writeUInt32LE(3, offset);
  offset += 4;
  buffer.writeUInt32LE(1, offset);
  offset += 4;
  buffer.writeUInt32LE(points.length, offset);
  offset += 4;

  for (const [x, y] of points) {
    buffer.writeDoubleLE(x, offset);
    offset += 8;
    buffer.writeDoubleLE(y, offset);
    offset += 8;
  }

  return buffer;
}

function gpkgGeometry(wkb: Buffer): Buffer {
  const blob = Buffer.alloc(8 + wkb.length);
  blob.writeUInt8(0x47, 0);
  blob.writeUInt8(0x50, 1);
  blob.writeUInt8(0, 2);
  blob.writeUInt8(1, 3);
  blob.writeInt32LE(25832, 4);
  wkb.copy(blob, 8);
  return blob;
}

function createGeothermalGpkg(filePath: string): void {
  const gpkg = new Database(filePath);
  try {
    gpkg.exec(`
      CREATE TABLE gpkg_geometry_columns (
        table_name TEXT NOT NULL,
        srs_id     INTEGER NOT NULL
      );
      CREATE TABLE potenzial_ong_gwwp (
        category TEXT,
        geom     BLOB NOT NULL
      );
      INSERT INTO gpkg_geometry_columns (table_name, srs_id)
      VALUES ('potenzial_ong_gwwp', 25832);
    `);

    const coveringZone = multipolygonWkb([
      [0, 0],
      [10_000_000, 0],
      [10_000_000, 10_000_000],
      [0, 10_000_000],
      [0, 0],
    ]);
    gpkg
      .prepare(`INSERT INTO potenzial_ong_gwwp (category, geom) VALUES (?, ?)`)
      .run("5-10_kW", gpkgGeometry(coveringZone));
  } finally {
    gpkg.close();
  }
}

test("geothermal enrichment: writes availability for a matched parcel", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "geothermal-enrich-"));
  const srcDir = join(tmpRoot, "source");
  const outDir = join(tmpRoot, "output");
  const gpkgPath = join(tmpRoot, "geothermal.gpkg");

  try {
    await mkdir(srcDir);
    await mkdir(outDir);
    await cp(FIXTURE_PATH, join(srcDir, "720_5432.json"));
    createGeothermalGpkg(gpkgPath);

    const result = await processCityJsonFiles(srcDir, {
      outDir,
      sourceCrsFallback: "EPSG:25832",
      geothermalFile: gpkgPath,
    });
    assert.equal(result.files[0]?.status, "analyzed");

    const raw = await readFile(join(outDir, "720_5432.json"), "utf-8");
    const parsed = JSON.parse(raw) as { CityObjects: Record<string, unknown> };
    let enrichedCount = 0;

    for (const cityObject of Object.values(parsed.CityObjects)) {
      if (!isObject(cityObject) || !isObject(cityObject.attributes)) continue;
      const det = cityObject.attributes.digitalEnergyTwin;
      if (!isObject(det) || !("geothermalEnergyAvailable" in det)) continue;
      assert.equal(det.geothermalEnergyAvailable, true);
      enrichedCount++;
    }

    assert.ok(enrichedCount > 0, "expected at least one matched building");
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
