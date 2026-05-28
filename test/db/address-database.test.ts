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

test("db/address-database: insertAddress writes street and address rows", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Maxstraße", "1", 700000.5, 5400000.5);
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
    } | undefined;
    raw.close();

    assert.ok(addr, "building_addresses row missing");
    assert.equal(addr.street_id, street.id);
    assert.equal(addr.house_number, "1");
    assert.equal(addr.cx, 700000.5);
    assert.equal(addr.cy, 5400000.5);
  });
});

test("db/address-database: null house_number is stored as NULL", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Günzenried", null, 1, 2);
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
    db.insertAddress("BLDG_1", "Maxstraße", "1", 1, 2);
    db.insertAddress("BLDG_2", "Maxstraße", "3", 3, 4);
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

test("db/address-database: duplicate building_id replaces the existing row", async () => {
  await withTempDb(async (dbPath) => {
    const db = openAddressDatabase(dbPath);
    db.insertAddress("BLDG_1", "Maxstraße", "1", 1, 2);
    db.insertAddress("BLDG_1", "Maxstraße", "1", 9, 10);
    db.close();

    const raw = new Database(dbPath, { readonly: true });
    const rows = raw.prepare(`SELECT cx, cy FROM building_addresses WHERE building_id = ?`).all("BLDG_1") as { cx: number; cy: number }[];
    raw.close();

    assert.equal(rows.length, 1, "expected exactly one row after replace");
    assert.equal(rows[0]?.cx, 9);
    assert.equal(rows[0]?.cy, 10);
  });
});
