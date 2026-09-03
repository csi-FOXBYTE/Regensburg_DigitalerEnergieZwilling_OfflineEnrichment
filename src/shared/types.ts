/**
 * 3D coordinate represented as `[x, y, z]`.
 *
 * @group Geometry
 */
export type Vertex = [number, number, number];

/**
 * Polygonal face consisting of an outer ring and optional inner rings.
 *
 * @group Geometry
 */
export interface PolygonFace {
  /** Face rings where the first ring is the outer ring. */
  rings: Vertex[][];
  /** Semantic CityJSON surface type, if available. */
  semanticType: string | undefined;
}

/**
 * Aggregated geometric metrics of a building.
 *
 * @group Geometry
 */
export interface BuildingGeometryMetrics {
  /** Building volume in cubic units of the CRS. */
  volume: number;
  /** Ground area. */
  groundArea: number;
  /** Upper floor area (currently tied to `groundArea`). */
  upperFloorArea: number;
  /** Gross external wall area. */
  grossExternalWallArea: number;
  /** Roof area. */
  roofArea: number;
  /** Area-weighted mean roof pitch in degrees. */
  roofPitchDegrees: number | null;
  /** Building height as the difference between minimum ground Z and maximum roof Z. */
  height: number | null;
  /** Envelope area from ground, wall, and roof surfaces. */
  envelopeArea: number;
}

/**
 * Analysis result for a single building object.
 *
 * @group Analysis
 */
export interface BuildingAnalysisResult {
  /** Unique CityObject ID. */
  buildingId: string;
  /** CityJSON object type, e.g. `Building` or `BuildingPart`. */
  buildingType: string;
  /** Calculated geometric metrics. */
  metrics: BuildingGeometryMetrics;
}

/**
 * Result status for one processed file.
 *
 * @group Analysis
 */
export interface CityJsonFileAnalysis {
  /** Absolute path of the processed file. */
  filePath: string;
  /** Processing status of the file. */
  status: "analyzed" | "skipped";
  /** Optional reason why a file was skipped. */
  reason?: string;
  /** Building analysis results if the file was processed. */
  buildings?: BuildingAnalysisResult[];
}

/**
 * Aggregated result across all processed CityJSON files.
 *
 * @group Analysis
 */
export interface CityJsonAnalysisResult {
  /** Per-file results. */
  files: CityJsonFileAnalysis[];
}

/**
 * Options for CRS handling during geometry operations.
 *
 * @group Coordinate Reference System
 */
export interface GeometryCrsOptions {
  /** Source CRS fallback when `metadata.referenceSystem` is missing. */
  sourceCrsFallback?: string | undefined;
}

/**
 * Options for file processing.
 *
 * @group Analysis
 */
export interface ProcessCityJsonFilesOptions extends GeometryCrsOptions {
  /** Output directory; writes in place when omitted. */
  outDir?: string | undefined;
  /** When true, runs the adjacency pass after indexing all buildings. */
  adjacency?: boolean | undefined;
  /** Maximum distance in metres between wall faces to count as adjacent. Defaults to 0.15. */
  adjacencyTolerance?: number | undefined;
  /** When set, writes building addresses to a SQLite file at this path. */
  addressOutput?: string | undefined;
  /** Retain only CityObjects whose adapter-provided municipality key matches this value. */
  municipalityKey?: string | undefined;
  /** When set, enriches buildings with construction year from the given GeoPackage. */
  ageZonesFile?: string | undefined;
  /** When set, enriches buildings with groundwater heat-pump availability from the given GeoPackage. */
  geothermalFile?: string | undefined;
}
