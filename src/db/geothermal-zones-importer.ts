import Database from "better-sqlite3";

import { geothermalConfig } from "../config/geothermal.js";
import { spatialConfig } from "../config/spatial.js";
import { quoteSqliteIdentifier } from "./sqlite-identifier.js";
import type { SpatialDatabase } from "./spatial-database.js";

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
 * Numeric categories whose lower bound reaches the configured threshold are available.
 * This makes `<5_kW` and all non-capacity/exclusion categories unavailable.
 *
 * @group Database
 * @param category Raw value from the configured geothermal category column.
 */
export function isGeothermalEnergyAvailableCategory(category: string | null): boolean {
  const match = category?.match(/^(\d+)-\d+_kW$/);
  return (
    match?.[1] != null &&
    Number.parseInt(match[1], 10) >= geothermalConfig.minimumAvailableCapacityKw
  );
}

/**
 * Reads parcel polygons for groundwater heat-pump potential from a GeoPackage
 * and inserts them into the temporary spatial database. The GPKG must use
 * the configured spatial SRID.
 *
 * @group Database
 * @param gpkgPath Absolute path to the GeoPackage file.
 * @param db Target spatial database.
 */
export function importGeothermalZonesFromGpkg(gpkgPath: string, db: SpatialDatabase): void {
  const gpkg = new Database(gpkgPath, { readonly: true });
  const { layerName, categoryColumn, geometryColumn } = geothermalConfig;
  const layerIdentifier = quoteSqliteIdentifier(layerName);
  const categoryIdentifier = quoteSqliteIdentifier(categoryColumn);
  const geometryIdentifier = quoteSqliteIdentifier(geometryColumn);

  try {
    const geomCol = gpkg
      .prepare(`SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ?`)
      .get(layerName) as { srs_id: number } | undefined;

    if (geomCol?.srs_id !== spatialConfig.srid) {
      throw new Error(
        `Geothermal GPKG layer '${layerName}' uses SRS ${geomCol?.srs_id ?? "unknown"}, expected ${spatialConfig.srid} (${spatialConfig.displayName}).`,
      );
    }

    const rows = gpkg
      .prepare(
        `SELECT ${categoryIdentifier} AS category, ${geometryIdentifier} AS geometry FROM ${layerIdentifier}`,
      )
      .iterate() as Iterable<{ category: string | null; geometry: Buffer }>;

    db.addGeothermalZones((function* () {
      for (const { category, geometry } of rows) {
        yield {
          category,
          available: isGeothermalEnergyAvailableCategory(category),
          wkb: stripGpkgHeader(geometry),
        };
      }
    })());
  } finally {
    gpkg.close();
  }
}
