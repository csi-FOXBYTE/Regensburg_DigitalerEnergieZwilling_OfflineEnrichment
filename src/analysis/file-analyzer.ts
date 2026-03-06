import { readFile, writeFile } from "node:fs/promises";

import { listJsonFiles } from "../discovery/list-json-files.js";
import type {
  BuildingAnalysisResult,
  CityJsonAnalysisResult,
  CityJsonFileAnalysis,
  ProcessCityJsonFilesOptions,
} from "../shared/types.js";
import { isCityJsonLike } from "../validation/cityjson.js";
import { analyzeBuildings } from "./building-analyzer.js";

/**
 * Analyzes all CityJSON files in a directory, enriches building attributes,
 * and writes updated files back.
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
  const files: CityJsonFileAnalysis[] = [];

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

    try {
      await writeFile(filePath, `${JSON.stringify(parsed)}\n`, "utf-8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown write error";
      files.push({ filePath, status: "skipped", reason });
      continue;
    }

    files.push({ filePath, status: "analyzed", buildings });
  }

  return { files };
}
