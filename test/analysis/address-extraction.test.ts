import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { processCityJsonFiles } from "../../src/analysis/file-analyzer.js";

const FIXTURE_DIR = join(process.cwd(), "test", "data");

test("address extraction: writes building_addresses rows for buildings with address entries", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "addr-extract-"));
  const outDir = join(tmpDir, "output");
  const addressOutput = join(tmpDir, "addresses.sqlite");

  try {
    await mkdir(outDir);
    await processCityJsonFiles(FIXTURE_DIR, {
      outDir,
      sourceCrsFallback: "EPSG:25832",
      addressOutput,
    });

    const db = new Database(addressOutput, { readonly: true });
    const rowCount = (db.prepare(`SELECT COUNT(*) AS n FROM building_addresses`).get() as { n: number }).n;
    const streetCount = (db.prepare(`SELECT COUNT(*) AS n FROM streets`).get() as { n: number }).n;
    const validBuildingCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM building_addresses WHERE is_valid_building = 1`).get() as {
        n: number;
      }
    ).n;
    db.close();

    // fixtures have 621 buildings with addresses; multi-number and semicolon entries add extra rows
    assert.ok(rowCount >= 621, `expected at least 621 address rows, got ${rowCount}`);
    assert.ok(streetCount > 0, "expected at least one street row");
    assert.ok(streetCount < rowCount, "expected street deduplication to reduce street count below address count");
    assert.ok(validBuildingCount > 0, "expected valid address rows");
    assert.ok(validBuildingCount < rowCount, "expected invalid address rows");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("address extraction: splits ThoroughfareName into street and house_number", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "addr-extract-"));
  const outDir = join(tmpDir, "output");
  const addressOutput = join(tmpDir, "addresses.sqlite");

  try {
    await mkdir(outDir);
    await processCityJsonFiles(FIXTURE_DIR, {
      outDir,
      sourceCrsFallback: "EPSG:25832",
      addressOutput,
    });

    const db = new Database(addressOutput, { readonly: true });

    // "Kapellenplatz 6" → street="Kapellenplatz", house_number="6"
    const kapellenplatz = db.prepare(`
      SELECT ba.house_number, s.name AS street
      FROM building_addresses ba
      JOIN streets s ON s.id = ba.street_id
      WHERE ba.building_id = 'DEBY_LOD2_17740'
    `).get() as { house_number: string | null; street: string } | undefined;

    // "Günzenried 1a" → street="Günzenried", house_number="1a"
    const guenzenried = db.prepare(`
      SELECT ba.house_number, s.name AS street
      FROM building_addresses ba
      JOIN streets s ON s.id = ba.street_id
      WHERE ba.building_id = 'DEBY_LOD2_6064661'
    `).get() as { house_number: string | null; street: string } | undefined;

    const validityRows = db.prepare(`
      SELECT building_id, is_valid_building
      FROM building_addresses
      WHERE building_id IN ('DEBY_LOD2_17737', 'DEBY_LOD2_17740')
      ORDER BY building_id
    `).all() as { building_id: string; is_valid_building: number }[];

    db.close();

    assert.ok(kapellenplatz, "DEBY_LOD2_17740 address row missing");
    assert.equal(kapellenplatz.street, "Kapellenplatz");
    assert.equal(kapellenplatz.house_number, "6");

    assert.ok(guenzenried, "DEBY_LOD2_6064661 address row missing");
    assert.equal(guenzenried.street, "Günzenried");
    assert.equal(guenzenried.house_number, "1a");
    assert.deepEqual(validityRows, [
      { building_id: "DEBY_LOD2_17737", is_valid_building: 0 },
      { building_id: "DEBY_LOD2_17740", is_valid_building: 1 },
    ]);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("address extraction: centroid coordinates are within tile bounds", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "addr-extract-"));
  const outDir = join(tmpDir, "output");
  const addressOutput = join(tmpDir, "addresses.sqlite");

  // fixtures cover tiles 720_5432 and 720_5434 — bounds cover both
  const TILE_MIN_X = 719000;
  const TILE_MAX_X = 723000;
  const TILE_MIN_Y = 5431000;
  const TILE_MAX_Y = 5437000;

  try {
    await mkdir(outDir);
    await processCityJsonFiles(FIXTURE_DIR, {
      outDir,
      sourceCrsFallback: "EPSG:25832",
      addressOutput,
    });

    const db = new Database(addressOutput, { readonly: true });
    const rows = db.prepare(`SELECT cx, cy FROM building_addresses`).all() as { cx: number; cy: number }[];
    db.close();

    for (const { cx, cy } of rows) {
      assert.ok(cx >= TILE_MIN_X && cx <= TILE_MAX_X, `cx ${cx} outside tile X bounds`);
      assert.ok(cy >= TILE_MIN_Y && cy <= TILE_MAX_Y, `cy ${cy} outside tile Y bounds`);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("address extraction: skipped when addressOutput is not set", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "addr-extract-"));
  const outDir = join(tmpDir, "output");

  try {
    await mkdir(outDir);
    // just verify processCityJsonFiles runs without error and produces no DB side-effect
    const result = await processCityJsonFiles(FIXTURE_DIR, {
      outDir,
      sourceCrsFallback: "EPSG:25832",
    });

    const analyzed = result.files.filter((f) => f.status === "analyzed");
    assert.ok(analyzed.length > 0, "expected analyzed files even without addressOutput");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("municipality filter: restricts both CityJSON output and address rows", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "municipality-filter-"));
  const outDir = join(tmpDir, "output");
  const addressOutput = join(tmpDir, "addresses.sqlite");

  try {
    await mkdir(outDir);
    await processCityJsonFiles(FIXTURE_DIR, {
      outDir,
      sourceCrsFallback: "EPSG:25832",
      addressOutput,
      municipalityKey: "09362000",
    });

    let buildingCount = 0;
    let buildingWithoutAddressCount = 0;

    for (const fileName of ["720_5432.json", "720_5434.json"]) {
      const raw = await readFile(join(outDir, fileName), "utf-8");
      const parsed = JSON.parse(raw) as {
        CityObjects: Record<
          string,
          {
            type?: string;
            attributes?: { Gemeindeschluessel?: string };
            address?: unknown[];
          }
        >;
      };

      for (const cityObject of Object.values(parsed.CityObjects)) {
        if (cityObject.type !== "Building" && cityObject.type !== "BuildingPart") continue;
        assert.equal(cityObject.attributes?.Gemeindeschluessel, "09362000");
        buildingCount++;
        if (!Array.isArray(cityObject.address) || cityObject.address.length === 0) {
          buildingWithoutAddressCount++;
        }
      }
    }

    const db = new Database(addressOutput, { readonly: true });
    const addressCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM building_addresses`).get() as { n: number }
    ).n;
    const addressedBuildingCount = (
      db.prepare(`SELECT COUNT(DISTINCT building_id) AS n FROM building_addresses`).get() as {
        n: number;
      }
    ).n;
    db.close();

    assert.equal(buildingCount, 404);
    assert.ok(buildingWithoutAddressCount > 0, "expected addressless Regensburg buildings to remain");
    assert.equal(addressedBuildingCount, 164);
    assert.equal(addressCount, 166);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
