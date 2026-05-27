import { readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

import { listJsonFiles } from "../discovery/list-json-files.js";
import { openSpatialDatabase } from "../db/spatial-database.js";
import { extractFacesFromGeometry } from "../geometry/face-extractor.js";
import { normalizeVerticesForGeometry } from "../geometry/coordinate-normalization.js";
import { wallFaceIntersectionArea } from "../geometry/polygon-math.js";
import { isObject } from "../shared/guards.js";
import type {
  BuildingAnalysisResult,
  CityJsonAnalysisResult,
  CityJsonFileAnalysis,
  ProcessCityJsonFilesOptions,
} from "../shared/types.js";
import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import { isCityJsonLike } from "../validation/cityjson.js";
import { analyzeBuildings } from "./building-analyzer.js";

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
    db.addBuilding(buildingId, filePath, cityObject.type);

    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));

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
    if (adjacencies.length === 0) continue;

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
        adjacentBuildings: adjacencies,
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
  const { outDir, adjacency, adjacencyTolerance = DEFAULT_ADJACENCY_TOLERANCE_M } = options;
  const files: CityJsonFileAnalysis[] = [];

  let pass1FilePaths: string[] | null = null;
  let db: ReturnType<typeof openSpatialDatabase> | null = null;

  try {
    if (adjacency) {
      db = openSpatialDatabase(wallFaceIntersectionArea);
      pass1FilePaths = [];

      for await (const { filePath, parsed } of iterateValidFiles(filePaths, files)) {
        indexBuildingsIntoDb(parsed, filePath, db, options);
        pass1FilePaths.push(filePath);
      }

      db.computeAdjacencies(adjacencyTolerance);
    }

    for await (const { filePath, parsed } of iterateValidFiles(pass1FilePaths ?? filePaths, files)) {
      let buildings: BuildingAnalysisResult[];
      try {
        buildings = analyzeBuildings(parsed, options);
        if (db != null) enrichWithAdjacencies(parsed, db);
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
  }

  return { files };
}
