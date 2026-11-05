/** @group Analysis */
export { processCityJsonFiles } from "./analysis/file-analyzer.js";

/** @group Validation */
export { DEFAULT_PROCESSING_LIMITS } from "./validation/limits.js";

/** @group Public Types */
export type {
  BuildingAnalysisResult,
  BuildingGeometryMetrics,
  CityJsonAnalysisResult,
  CityJsonFileAnalysis,
  GeometryCrsOptions,
  ProcessCityJsonFilesOptions,
} from "./shared/types.js";
export type { ProcessingLimits } from "./validation/limits.js";
