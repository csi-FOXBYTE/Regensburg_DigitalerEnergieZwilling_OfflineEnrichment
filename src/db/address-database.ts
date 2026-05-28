import Database from "better-sqlite3";

/**
 * Opens (or creates) a SQLite database at the given path and initialises the
 * address schema. No SpatiaLite extension is required.
 *
 * @group Database
 * @param dbPath Absolute path to the SQLite file to create or open.
 * @returns Database handle for inserting address records.
 */
export function openAddressDatabase(dbPath: string) {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS streets (
      id   INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS building_addresses (
      building_id  TEXT PRIMARY KEY,
      street_id    INTEGER NOT NULL REFERENCES streets(id),
      house_number TEXT,
      cx           REAL NOT NULL,
      cy           REAL NOT NULL
    )
  `);

  const stmtInsertStreet = db.prepare<[string]>(
    `INSERT OR IGNORE INTO streets (name) VALUES (?)`,
  );
  const stmtGetStreetId = db.prepare<[string]>(
    `SELECT id FROM streets WHERE name = ?`,
  );
  const stmtInsertAddress = db.prepare<[string, number, string | null, number, number]>(
    `INSERT OR REPLACE INTO building_addresses (building_id, street_id, house_number, cx, cy)
     VALUES (?, ?, ?, ?, ?)`,
  );

  return {
    /**
     * Inserts one address record, creating the street row if needed.
     *
     * @group Database
     */
    insertAddress(
      buildingId: string,
      street: string,
      houseNumber: string | null,
      cx: number,
      cy: number,
    ): void {
      stmtInsertStreet.run(street);
      const row = stmtGetStreetId.get(street) as { id: number };
      stmtInsertAddress.run(buildingId, row.id, houseNumber, cx, cy);
    },

    /** Closes the database connection. */
    close(): void {
      db.close();
    },
  };
}

/**
 * Inferred type of the value returned by {@link openAddressDatabase}.
 *
 * @group Database
 */
export type AddressDatabase = ReturnType<typeof openAddressDatabase>;
