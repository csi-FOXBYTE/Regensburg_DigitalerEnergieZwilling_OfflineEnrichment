export type Vertex = [number, number, number];

export interface PolygonFace {
  rings: Vertex[][];
  semanticType: string | undefined;
}

export interface BuildingGeometryMetrics {
  volume: number;
  groundArea: number;
  upperFloorArea: number;
  grossExternalWallArea: number;
  roofArea: number;
  roofPitchDegrees: number | null;
  height: number | null;
  envelopeArea: number;
}

export interface BuildingAnalysisResult {
  buildingId: string;
  buildingType: string;
  metrics: BuildingGeometryMetrics;
}

export interface CityJsonFileAnalysis {
  filePath: string;
  status: "analyzed" | "skipped";
  reason?: string;
  buildings?: BuildingAnalysisResult[];
}

export interface CityJsonAnalysisResult {
  files: CityJsonFileAnalysis[];
}

export interface GeometryCrsOptions {
  sourceCrsFallback?: string | undefined;
}

export interface ProcessCityJsonFilesOptions extends GeometryCrsOptions { }
