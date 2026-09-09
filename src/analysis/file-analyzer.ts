import { readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

import { adaptBuildingFeature } from "../config/adapters/buildingFeature.js";
import { listJsonFiles } from "../discovery/list-json-files.js";
import { openAddressDatabase } from "../db/address-database.js";
import type { AddressDatabase } from "../db/address-database.js";
import { importAgeZonesFromGpkg } from "../db/age-zones-importer.js";
import { importGeothermalZonesFromGpkg } from "../db/geothermal-zones-importer.js";
import { openSpatialDatabase } from "../db/spatial-database.js";
import { extractFacesFromGeometry } from "../geometry/face-extractor.js";
import { normalizeVerticesForGeometry } from "../geometry/coordinate-normalization.js";
import { wallSplitHeight } from "../geometry/roof-islands.js";
import { isObject } from "../shared/guards.js";
import type {
  BuildingAnalysisResult,
  CityJsonAnalysisResult,
  CityJsonFileAnalysis,
  PolygonFace,
  ProcessCityJsonFilesOptions,
} from "../shared/types.js";
import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import { isCityJsonLike } from "../validation/cityjson.js";
import { analyzeBuildings } from "./building-analyzer.js";
import { filterCityObjectsByMunicipality } from "./municipality-filter.js";

const DEFAULT_ADJACENCY_TOLERANCE_M = 0.15;

function indexBuildingsIntoDb(
  parsed: CityJSONV201,
  filePath: string,
  db: ReturnType<typeof openSpatialDatabase>,
  options: ProcessCityJsonFilesOptions,
): void {
  const vertices = normalizeVerticesForGeometry(parsed, options);

  for (const buildingId of Object.keys(parsed.CityObjects)) {
    const cityObject = parsed.CityObjects[buildingId];
    if (!isObject(cityObject)) continue;
    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));
    db.addBuilding(buildingId, filePath, cityObject.type, wallSplitHeight(faces));

    for (const face of faces) {
      if (face.semanticType === "WallSurface") {
        db.addWallSurface(buildingId, face);
      }
    }
  }
}

function enrichWithAdjacencies(
  parsed: CityJSONV201,
  db: ReturnType<typeof openSpatialDatabase>,
): void {
  for (const buildingId of Object.keys(parsed.CityObjects)) {
    const adjacencies = db.getAdjacencies(buildingId);

    const cityObject = parsed.CityObjects[buildingId];
    if (!isObject(cityObject)) continue;

    const existingAttributes = isObject(cityObject.attributes) ? cityObject.attributes : {};
    const existingDet = isObject(existingAttributes.digitalEnergyTwin)
      ? existingAttributes.digitalEnergyTwin
      : {};

    cityObject.attributes = {
      ...existingAttributes,
      digitalEnergyTwin: {
        ...existingDet,
        adjacentBuildings: JSON.stringify(adjacencies),
      },
    };
  }
}

function groundBboxCenter(faces: PolygonFace[]): [number, number] | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const face of faces) {
    if (face.semanticType !== "GroundSurface") continue;
    for (const ring of face.rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

function indexAddressesFromFile(
  parsed: CityJSONV201,
  options: ProcessCityJsonFilesOptions,
  addressDb: AddressDatabase,
): void {
  const vertices = normalizeVerticesForGeometry(parsed, options);

  for (const [buildingId, cityObject] of Object.entries(parsed.CityObjects)) {
    if (!isObject(cityObject)) continue;

    const adaptedFeature = adaptBuildingFeature(cityObject);
    if (adaptedFeature.addresses.length === 0) continue;

    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));
    const center = groundBboxCenter(faces);
    if (center === null) continue;
    const [cx, cy] = center;

    for (const { street, houseNumber } of adaptedFeature.addresses) {
      addressDb.insertAddress(
        buildingId,
        street,
        houseNumber,
        cx,
        cy,
        adaptedFeature.isValidBuilding,
      );
    }
  }
}

function enrichWithAgeZonesFromFile(
  parsed: CityJSONV201,
  options: ProcessCityJsonFilesOptions,
  db: ReturnType<typeof openSpatialDatabase>,
): void {
  const vertices = normalizeVerticesForGeometry(parsed, options);

  for (const [, cityObject] of Object.entries(parsed.CityObjects)) {
    if (!isObject(cityObject)) continue;
    if (cityObject.type !== "Building" && cityObject.type !== "BuildingPart") continue;

    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));
    const center = groundBboxCenter(faces);
    if (center === null) continue;
    const [cx, cy] = center;

    const constructionYear = db.getConstructionYear(cx, cy);
    if (constructionYear === null) continue;

    const existingAttributes = isObject(cityObject.attributes) ? cityObject.attributes : {};
    const existingDet = isObject(existingAttributes.digitalEnergyTwin)
      ? existingAttributes.digitalEnergyTwin
      : {};

    cityObject.attributes = {
      ...existingAttributes,
      digitalEnergyTwin: {
        ...existingDet,
        constructionYear,
      },
    };
  }
}

function enrichWithGeothermalZonesFromFile(
  parsed: CityJSONV201,
  options: ProcessCityJsonFilesOptions,
  db: ReturnType<typeof openSpatialDatabase>,
): void {
  const vertices = normalizeVerticesForGeometry(parsed, options);

  for (const cityObject of Object.values(parsed.CityObjects)) {
    if (!isObject(cityObject)) continue;
    if (cityObject.type !== "Building" && cityObject.type !== "BuildingPart") continue;

    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));
    const center = groundBboxCenter(faces);
    if (center === null) continue;
    const [cx, cy] = center;

    const geothermalEnergyAvailable = db.getGeothermalEnergyAvailability(cx, cy);
    if (geothermalEnergyAvailable === null) continue;

    const existingAttributes = isObject(cityObject.attributes) ? cityObject.attributes : {};
    const existingDet = isObject(existingAttributes.digitalEnergyTwin)
      ? existingAttributes.digitalEnergyTwin
      : {};

    cityObject.attributes = {
      ...existingAttributes,
      digitalEnergyTwin: {
        ...existingDet,
        geothermalEnergyAvailable,
      },
    };
  }
}

async function* iterateValidFiles(
  filePaths: string[],
  files: CityJsonFileAnalysis[],
): AsyncGenerator<{ filePath: string; parsed: CityJSONV201 }> {
  for (const filePath of filePaths) {
    let parsed: unknown;
    try {
      const raw = await readFile(filePath, "utf-8");
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown read/parse error";
      files.push({ filePath, status: "skipped", reason });
      continue;
    }

    if (!isCityJsonLike(parsed)) {
      files.push({
        filePath,
        status: "skipped",
        reason: "File does not match the expected CityJSON structure (type/CityObjects/vertices).",
      });
      continue;
    }

    yield { filePath, parsed };
  }
}

/**
 * Analyzes all CityJSON files in a directory, enriches building attributes,
 * and writes updated files back. When `options.adjacency` is true a second
 * pass computes shared wall areas across all indexed buildings.
 *
 * @group Analysis
 * @param srcDir Source directory with JSON files.
 * @param options Options for CRS normalization and processing.
 * @returns Aggregated result of file and building analysis.
 */
export async function processCityJsonFiles(
  srcDir: string,
  options: ProcessCityJsonFilesOptions = {},
): Promise<CityJsonAnalysisResult> {
  const filePaths = await listJsonFiles(srcDir);
  const {
    outDir,
    adjacency,
    adjacencyTolerance = DEFAULT_ADJACENCY_TOLERANCE_M,
    addressOutput,
    ageZonesFile,
    geothermalFile,
    municipalityKey,
  } = options;
  const needsSpatialDb = adjacency || ageZonesFile != null || geothermalFile != null;
  const shouldRunFirstPass = adjacency === true;
  const shouldEnrichAgeZones = ageZonesFile != null;
  const shouldEnrichGeothermal = geothermalFile != null;
  const shouldEnrichAdjacency = adjacency === true;
  const shouldExtractAddresses = addressOutput != null;
  const files: CityJsonFileAnalysis[] = [];

  let pass1FilePaths: string[] | null = null;
  let db: ReturnType<typeof openSpatialDatabase> | null = null;
  let addressDb: AddressDatabase | null = null;

  try {
    if (shouldExtractAddresses) {
      addressDb = openAddressDatabase(addressOutput);
    }

    if (needsSpatialDb) {
      db = openSpatialDatabase();

      if (shouldEnrichAgeZones) {
        importAgeZonesFromGpkg(ageZonesFile, db);
      }

      if (shouldEnrichGeothermal) {
        importGeothermalZonesFromGpkg(geothermalFile, db);
      }

      if (shouldRunFirstPass) {
        pass1FilePaths = [];

        for await (const { filePath, parsed } of iterateValidFiles(filePaths, files)) {
          if (municipalityKey != null) {
            filterCityObjectsByMunicipality(parsed, municipalityKey);
          }
          indexBuildingsIntoDb(parsed, filePath, db, options);
          pass1FilePaths.push(filePath);
        }

        db.computeAdjacencies(adjacencyTolerance);
      }
    }

    for await (const { filePath, parsed } of iterateValidFiles(pass1FilePaths ?? filePaths, files)) {
      let buildings: BuildingAnalysisResult[];
      try {
        if (municipalityKey != null) {
          filterCityObjectsByMunicipality(parsed, municipalityKey);
        }
        buildings = analyzeBuildings(parsed, options);
        if (shouldEnrichAdjacency && db != null) enrichWithAdjacencies(parsed, db);
        if (shouldEnrichAgeZones && db != null) enrichWithAgeZonesFromFile(parsed, options, db);
        if (shouldEnrichGeothermal && db != null) {
          enrichWithGeothermalZonesFromFile(parsed, options, db);
        }
        if (shouldExtractAddresses && addressDb != null) indexAddressesFromFile(parsed, options, addressDb);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown geometry normalization error";
        files.push({ filePath, status: "skipped", reason });
        continue;
      }

      const outPath = outDir ? join(outDir, basename(filePath)) : filePath;
      try {
        await writeFile(outPath, `${JSON.stringify(parsed)}\n`, "utf-8");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown write error";
        files.push({ filePath, status: "skipped", reason });
        continue;
      }

      files.push({ filePath, status: "analyzed", buildings });
    }
  } finally {
    db?.close();
    addressDb?.close();
  }

  return { files };
}
