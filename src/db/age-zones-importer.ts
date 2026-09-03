import Database from "better-sqlite3";

import { ageZonesConfig } from "../config/ageZones.js";
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

function parseLowerYear(dominant: string): number | null {
  const match = dominant.match(/^(\d{4})/);
  return match?.[1] != null ? parseInt(match[1], 10) : null;
}

/**
 * Reads age zone polygons from a GeoPackage file and inserts them into the
 * spatial database. The GPKG must use the configured spatial SRID.
 *
 * @group Database
 * @param gpkgPath Absolute path to the GeoPackage file.
 * @param db Target spatial database.
 */
export function importAgeZonesFromGpkg(gpkgPath: string, db: SpatialDatabase): void {
  const gpkg = new Database(gpkgPath, { readonly: true });
  const { layerName, classificationColumn, geometryColumn } = ageZonesConfig;
  const layerIdentifier = quoteSqliteIdentifier(layerName);
  const classificationIdentifier = quoteSqliteIdentifier(classificationColumn);
  const geometryIdentifier = quoteSqliteIdentifier(geometryColumn);

  try {
    const geomCol = gpkg
      .prepare(`SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ?`)
      .get(layerName) as { srs_id: number } | undefined;

    if (geomCol?.srs_id !== spatialConfig.srid) {
      throw new Error(
        `Age zones GPKG layer '${layerName}' uses SRS ${geomCol?.srs_id ?? "unknown"}, expected ${spatialConfig.srid} (${spatialConfig.displayName}).`,
      );
    }

    const rows = gpkg
      .prepare(
        `SELECT ${classificationIdentifier} AS classification, ${geometryIdentifier} AS geometry FROM ${layerIdentifier}`,
      )
      .all() as { classification: string; geometry: Buffer }[];

    for (const { classification, geometry } of rows) {
      db.addAgeZone(
        classification,
        parseLowerYear(classification),
        stripGpkgHeader(geometry),
      );
    }
  } finally {
    gpkg.close();
  }
}
