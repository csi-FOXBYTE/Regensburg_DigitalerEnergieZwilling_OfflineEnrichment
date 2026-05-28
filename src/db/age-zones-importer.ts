import Database from "better-sqlite3";

import type { SpatialDatabase } from "./spatial-database.js";

function stripGpkgHeader(blob: Buffer): Buffer {
  // bit 0 = byte order, bits 1-3 = envelope indicator
  const envelopeIndicator = ((blob[3] ?? 0) >> 1) & 0b111;
  const envelopeSizes = [0, 32, 48, 48, 64];
  const headerSize = 8 + (envelopeSizes[envelopeIndicator] ?? 0);
  return blob.subarray(headerSize);
}

function parseLowerYear(dominant: string): number | null {
  const match = dominant.match(/^(\d{4})/);
  return match?.[1] != null ? parseInt(match[1], 10) : null;
}

/**
 * Reads age zone polygons from a GeoPackage file and inserts them into the
 * spatial database. The GPKG must use EPSG:25832.
 *
 * @group Database
 * @param gpkgPath Absolute path to the GeoPackage file.
 * @param db Target spatial database.
 */
export function importAgeZonesFromGpkg(gpkgPath: string, db: SpatialDatabase): void {
  const gpkg = new Database(gpkgPath, { readonly: true });

  try {
    const geomCol = gpkg
      .prepare(`SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = 'gebiete__baualtersklasse'`)
      .get() as { srs_id: number } | undefined;

    if (geomCol?.srs_id !== 25832) {
      throw new Error(
        `Age zones GPKG uses SRS ${geomCol?.srs_id ?? "unknown"}, expected 25832 (ETRS89 UTM32N).`,
      );
    }

    const rows = gpkg
      .prepare(`SELECT Dominant_Baualtersklasse AS dominant, geom FROM gebiete__baualtersklasse`)
      .all() as { dominant: string; geom: Buffer }[];

    for (const { dominant, geom } of rows) {
      db.addAgeZone(dominant, parseLowerYear(dominant), stripGpkgHeader(geom));
    }
  } finally {
    gpkg.close();
  }
}
