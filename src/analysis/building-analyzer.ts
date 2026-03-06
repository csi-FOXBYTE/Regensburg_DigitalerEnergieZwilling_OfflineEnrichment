import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import { extractFacesFromGeometry } from "../geometry/face-extractor.js";
import { calculateBuildingGeometryMetrics } from "../geometry/building-metrics.js";
import { normalizeVerticesForGeometry } from "../geometry/coordinate-normalization.js";
import { isObject } from "../shared/guards.js";
import type { BuildingAnalysisResult, GeometryCrsOptions } from "../shared/types.js";

function enrichCityObjectAttributes(
  cityObject: Record<string, unknown>,
  metrics: BuildingAnalysisResult["metrics"],
): void {
  const existingAttributes = isObject(cityObject.attributes) ? cityObject.attributes : {};
  cityObject.attributes = {
    ...existingAttributes,
    digitalEnergyTwin: metrics,
  };
}

export function analyzeBuildings(
  cityJson: CityJSONV201,
  crsOptions: GeometryCrsOptions = {},
): BuildingAnalysisResult[] {
  const results: BuildingAnalysisResult[] = [];
  const vertices = normalizeVerticesForGeometry(cityJson, crsOptions);

  for (const [buildingId, cityObject] of Object.entries(cityJson.CityObjects)) {
    if (!isObject(cityObject) || typeof cityObject.type !== "string") {
      continue;
    }

    if (cityObject.type !== "Building" && cityObject.type !== "BuildingPart") {
      continue;
    }

    const geometries = Array.isArray(cityObject.geometry) ? cityObject.geometry : [];
    const faces = geometries.flatMap((geometry) => extractFacesFromGeometry(geometry, vertices));
    if (faces.length === 0) {
      continue;
    }

    const result: BuildingAnalysisResult = {
      buildingId,
      buildingType: cityObject.type,
      metrics: calculateBuildingGeometryMetrics(faces),
    };

    enrichCityObjectAttributes(cityObject, result.metrics);
    results.push(result);
  }

  return results;
}
