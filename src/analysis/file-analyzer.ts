import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
  Vertex,
} from "../shared/types.js";
import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import { isCityJsonLike, validateCityJsonContent } from "../validation/cityjson.js";
import { exceedsJsonNestingDepth, resolveProcessingLimits } from "../validation/limits.js";
import type { ProcessingLimits } from "../validation/limits.js";
import { analyzeBuildings } from "./building-analyzer.js";
import { filterCityObjectsByMunicipality } from "./municipality-filter.js";

const DEFAULT_ADJACENCY_TOLERANCE_M = 0.15;

function indexBuildingsIntoDb(
  parsed: CityJSONV201,
  vertices: Vertex[],
  filePath: string,
  db: ReturnType<typeof openSpatialDatabase>,
): void {
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

/**
 * Reads a file only if it does not exceed `maxFileBytes`. The size is taken
 * from the open handle so it describes the file that is actually read.
 */
async function readBoundedFile(filePath: string, maxFileBytes: number): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    if (size > maxFileBytes) {
      throw new Error(`File is ${size} bytes (limit ${maxFileBytes}).`);
    }
    return await handle.readFile("utf-8");
  } finally {
    await handle.close();
  }
}

/**
 * Reads, bounds-checks, parses and validates each file. Files that fail any
 * check are recorded as skipped; only valid documents are yielded.
 */
async function* iterateValidFiles(
  filePaths: string[],
  files: CityJsonFileAnalysis[],
  limits: ProcessingLimits,
): AsyncGenerator<{ filePath: string; parsed: CityJSONV201 }> {
  for (const filePath of filePaths) {
    let parsed: unknown;
    try {
      const raw = await readBoundedFile(filePath, limits.maxFileBytes);
      if (exceedsJsonNestingDepth(raw, limits.maxNestingDepth)) {
        throw new Error(`JSON nesting exceeds depth ${limits.maxNestingDepth}.`);
      }
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

    const invalidReason = validateCityJsonContent(parsed, limits);
    if (invalidReason !== null) {
      files.push({ filePath, status: "skipped", reason: invalidReason });
      continue;
    }

    yield { filePath, parsed };
  }
}

/** True when `path` is `dir` itself or lies below it (both absolute). */
function isWithin(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Maps every input file to its output path. With an output directory, the
 * path below `srcDir` is preserved, so `a/x.json` and `b/x.json` no longer
 * overwrite each other. Paths that would still coincide, compared without
 * case and Unicode normalization differences because the output may land on
 * a case-insensitive file system, abort the run instead of losing a tile.
 *
 * @throws When two input files map to the same output path.
 */
function planOutputPaths(srcDir: string, filePaths: string[], outDir: string | undefined): Map<string, string> {
  const plan = new Map<string, string>();
  if (!outDir) {
    for (const filePath of filePaths) plan.set(filePath, filePath);
    return plan;
  }

  const root = resolve(srcDir);
  const outRoot = resolve(outDir);
  const seen = new Map<string, string>();
  for (const filePath of filePaths) {
    const rel = relative(root, resolve(filePath));
    if (rel === "" || !isWithin(resolve(filePath), root)) {
      throw new Error(`Input file ${filePath} is outside the source directory.`);
    }
    const outPath = join(outRoot, rel);
    const key = outPath.normalize("NFC").toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new Error(`Output path collision: ${previous} and ${filePath} both map to ${outPath}.`);
    }
    seen.set(key, filePath);
    plan.set(filePath, outPath);
  }
  return plan;
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
  const {
    outDir,
    adjacency,
    adjacencyTolerance = DEFAULT_ADJACENCY_TOLERANCE_M,
    addressOutput,
    ageZonesFile,
    geothermalFile,
    municipalityKey,
  } = options;
  const limits = resolveProcessingLimits(options.limits);
  const discovered = await listJsonFiles(srcDir);
  // An output directory inside the source directory must not feed earlier
  // results back in as input.
  const filePaths = outDir && resolve(outDir) !== resolve(srcDir)
    ? discovered.filter((filePath) => !isWithin(resolve(filePath), resolve(outDir)))
    : discovered;
  const outputPaths = planOutputPaths(srcDir, filePaths, outDir);
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

        for await (const { filePath, parsed } of iterateValidFiles(filePaths, files, limits)) {
          if (municipalityKey != null) {
            filterCityObjectsByMunicipality(parsed, municipalityKey);
          }
          let vertices: Vertex[];
          try {
            vertices = normalizeVerticesForGeometry(parsed, options);
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Unknown geometry normalization error";
            files.push({ filePath, status: "skipped", reason });
            continue;
          }
          indexBuildingsIntoDb(parsed, vertices, filePath, db);
          pass1FilePaths.push(filePath);
        }

        db.computeAdjacencies(adjacencyTolerance);
      }
    }

    for await (const { filePath, parsed } of iterateValidFiles(pass1FilePaths ?? filePaths, files, limits)) {
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

      const outPath = outputPaths.get(filePath) ?? filePath;
      try {
        if (outPath !== filePath) await mkdir(dirname(outPath), { recursive: true });
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
