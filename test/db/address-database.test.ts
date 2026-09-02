import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { openAddressDatabase } from "../../src/db/address-database.js";

async function withTempDb(fn: (dbPath: string) => Promise<void>): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), "addrdb-"));
  const dbPath = join(tmpDir, "addresses.sqlite");
  try {
    await fn(dbPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test("db/address-database: creates streets and building_addresses tables", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const tables = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]).map((r) => r.name);
    raw.close();

    assert.ok(tables.includes("streets"), "streets table missing");
    assert.ok(tables.includes("building_addresses"), "building_addresses table missing");
  });
});

test("db/address-database: adds the validity flag to an existing address database", async () => {
  await withTempDb(async (dbPath) => {
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE streets (
        id   INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE building_addresses (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        building_id  TEXT NOT NULL,
        street_id    INTEGER NOT NULL REFERENCES streets(id),
        house_number TEXT,
        cx           REAL NOT NULL,
        cy           REAL NOT NULL
      );
      INSERT INTO streets (name) VALUES ('Altstadt');
      INSERT INTO building_addresses (building_id, street_id, house_number, cx, cy)
        VALUES ('LEGACY_1', 1, '1', 1, 2);
    `);
    legacy.close();

    const db = openAddressDatabase(dbPath);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const row = raw
      .prepare(`SELECT is_valid_building FROM building_addresses WHERE building_id = ?`)
      .get("LEGACY_1") as { is_valid_building: number } | undefined;
    raw.close();

    assert.equal(row?.is_valid_building, 0);
  });
});

test("db/address-database: insertAddress writes street and address rows", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Maxstraße", "1", 700000.5, 5400000.5, true);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const street = raw.prepare(`SELECT id, name FROM streets WHERE name = ?`).get("Maxstraße") as { id: number; name: string } | undefined;
    assert.ok(street, "street row missing");

    const addr = raw.prepare(`SELECT * FROM building_addresses WHERE building_id = ?`).get("BLDG_1") as {
      building_id: string;
      street_id: number;
      house_number: string | null;
      cx: number;
      cy: number;
      is_valid_building: number;
    } | undefined;
    raw.close();

    assert.ok(addr, "building_addresses row missing");
    assert.equal(addr.street_id, street.id);
    assert.equal(addr.house_number, "1");
    assert.equal(addr.cx, 700000.5);
    assert.equal(addr.cy, 5400000.5);
    assert.equal(addr.is_valid_building, 1);
  });
});

test("db/address-database: null house_number is stored as NULL", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Günzenried", null, 1, 2, false);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const addr = raw.prepare(`SELECT house_number FROM building_addresses WHERE building_id = ?`).get("BLDG_1") as { house_number: string | null } | undefined;
    raw.close();

    assert.equal(addr?.house_number, null);
  });
});

test("db/address-database: streets are deduplicated across buildings", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Maxstraße", "1", 1, 2, true);
    db.insertAddress("BLDG_2", "Maxstraße", "3", 3, 4, false);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const streets = raw.prepare(`SELECT id FROM streets WHERE name = ?`).all("Maxstraße") as { id: number }[];
    const addrA = raw.prepare(`SELECT street_id FROM building_addresses WHERE building_id = ?`).get("BLDG_1") as { street_id: number } | undefined;
    const addrB = raw.prepare(`SELECT street_id FROM building_addresses WHERE building_id = ?`).get("BLDG_2") as { street_id: number } | undefined;
    raw.close();

    assert.equal(streets.length, 1, "expected exactly one street row");
    assert.equal(addrA?.street_id, addrB?.street_id, "both buildings should reference the same street row");
  });
});

test("db/address-database: same building_id can have multiple address rows", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Maxstraße", "1", 1, 2, true);
    db.insertAddress("BLDG_1", "Maxstraße", "3", 3, 4, true);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const rows = raw.prepare(`SELECT house_number FROM building_addresses WHERE building_id = ?`).all("BLDG_1") as { house_number: string }[];
    raw.close();

    assert.equal(rows.length, 2, "expected two rows for the same building_id");
    assert.deepEqual(rows.map((r) => r.house_number), ["1", "3"]);
  });
});
