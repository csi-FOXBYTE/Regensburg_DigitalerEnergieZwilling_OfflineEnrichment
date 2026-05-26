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
import { isCityJsonLike } from "../validation/cityjson.js";
import { analyzeBuildings } from "./building-analyzer.js";

const DEFAULT_ADJACENCY_TOLERANCE_M = 0.15;

interface IndexedFile {
  filePath: string;
  parsed: ReturnType<typeof JSON.parse>;
  buildings: BuildingAnalysisResult[];
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

  if (!adjacency) {
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

      let buildings: BuildingAnalysisResult[];
      try {
        buildings = analyzeBuildings(parsed, options);
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

    return { files };
  }

  // Adjacency pipeline -------------------------------------------------------

  const db = openSpatialDatabase(wallFaceIntersectionArea);
  const indexed: IndexedFile[] = [];

  try {
    // Pass 1: analyze metrics and index wall surfaces
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

      let buildings: BuildingAnalysisResult[];
      try {
        buildings = analyzeBuildings(parsed, options);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown geometry normalization error";
        files.push({ filePath, status: "skipped", reason });
        continue;
      }

      const vertices = normalizeVerticesForGeometry(parsed, options);

      for (const { buildingId, buildingType } of buildings) {
        db.addBuilding(buildingId, filePath, buildingType);

        const cityObject = parsed.CityObjects[buildingId];
        if (!isObject(cityObject)) continue;
        const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
        const faces = geometries.flatMap((g) => extractFacesFromGeometry(g, vertices));

        for (const face of faces) {
          if (face.semanticType === "WallSurface") {
            db.addWallSurface(buildingId, face);
          }
        }
      }

      indexed.push({ filePath, parsed, buildings });
    }

    db.computeAdjacencies(adjacencyTolerance);

    // Pass 2: enrich with adjacency data and write
    for (const { filePath, parsed, buildings } of indexed) {
      for (const { buildingId } of buildings) {
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
    db.close();
  }

  return { files };
}
