import Database from "better-sqlite3";

import type { SpatialDatabase } from "./spatial-database.js";

const GEOTHERMAL_LAYER = "potenzial_ong_gwwp";

function stripGpkgHeader(blob: Buffer): Buffer {
  // bit 0 = byte order, bits 1-3 = envelope indicator
  const envelopeIndicator = ((blob[3] ?? 0) >> 1) & 0b111;
  const envelopeSizes = [0, 32, 48, 48, 64];
  const headerSize = 8 + (envelopeSizes[envelopeIndicator] ?? 0);
  return blob.subarray(headerSize);
}

/**
 * Maps the GeoPackage's groundwater heat-pump capacity category to the
 * availability flag used by the CityJSON enrichment.
 *
 * Numeric categories whose lower bound is at least 5 kW are available.
 * This makes `<5_kW` and all non-capacity/exclusion categories unavailable.
 *
 * @group Database
 * @param category Raw `category` value from `potenzial_ong_gwwp`.
 */
export function isGeothermalEnergyAvailableCategory(category: string | null): boolean {
  const match = category?.match(/^(\d+)-\d+_kW$/);
  return match?.[1] != null && Number.parseInt(match[1], 10) >= 5;
}

/**
 * Reads parcel polygons for groundwater heat-pump potential from a GeoPackage
 * and inserts them into the temporary spatial database. The GPKG must use
 * EPSG:25832.
 *
 * @group Database
 * @param gpkgPath Absolute path to the GeoPackage file.
 * @param db Target spatial database.
 */
export function importGeothermalZonesFromGpkg(gpkgPath: string, db: SpatialDatabase): void {
  const gpkg = new Database(gpkgPath, { readonly: true });

  try {
    const geomCol = gpkg
      .prepare(`SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ?`)
      .get(GEOTHERMAL_LAYER) as { srs_id: number } | undefined;

    if (geomCol?.srs_id !== 25832) {
      throw new Error(
        `Geothermal GPKG layer '${GEOTHERMAL_LAYER}' uses SRS ${geomCol?.srs_id ?? "unknown"}, expected 25832 (ETRS89 UTM32N).`,
      );
    }

    const rows = gpkg
      .prepare(`SELECT category, geom FROM ${GEOTHERMAL_LAYER}`)
      .iterate() as Iterable<{ category: string | null; geom: Buffer }>;

    db.addGeothermalZones((function* () {
      for (const { category, geom } of rows) {
        yield {
          category,
          available: isGeothermalEnergyAvailableCategory(category),
          wkb: stripGpkgHeader(geom),
        };
      }
    })());
  } finally {
    gpkg.close();
  }
}
