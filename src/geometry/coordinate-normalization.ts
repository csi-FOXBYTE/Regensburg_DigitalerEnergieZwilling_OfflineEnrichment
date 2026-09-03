import proj4 from "proj4";
import * as proj4ListModule from "proj4-list";

import { spatialConfig } from "../config/spatial.js";
import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import type { GeometryCrsOptions, Vertex } from "../shared/types.js";

const proj4ListNamespace = proj4ListModule as unknown as { default?: unknown };
const proj4List = (proj4ListNamespace.default ?? proj4ListModule) as Record<
  string,
  [string, string]
>;

/**
 * Normalizes different CRS notations into an internally processable format.
 *
 * @group Geometry
 * @param referenceSystem Input CRS from metadata or fallback.
 * @returns Normalized CRS code or `null` for unsupported formats.
 */
function normalizeCrsCode(referenceSystem: string): string | null {
  const trimmed = referenceSystem.trim();

  if (trimmed.includes("+proj=")) {
    return trimmed;
  }

  if (/^EPSG:\d+$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const epsgAuthorityMatch = trimmed.match(/EPSG::?(\d+)/i);
  if (epsgAuthorityMatch) {
    return `EPSG:${epsgAuthorityMatch[1]}`;
  }

  const ogcUrlMatch = trimmed.match(/\/EPSG\/0\/(\d+)$/i);
  if (ogcUrlMatch) {
    return `EPSG:${ogcUrlMatch[1]}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `EPSG:${trimmed}`;
  }

  return null;
}

/**
 * Ensures a proj4 definition is available for a CRS.
 *
 * @group Geometry
 * @param crs CRS code or direct proj4 definition.
 */
function ensureProjDefinition(crs: string): void {
  if (crs.includes("+proj=")) {
    return;
  }

  const existing = proj4.defs(crs);
  if (!existing) {
    const knownDefinition = proj4List[crs]?.[1];
    if (knownDefinition) {
      proj4.defs(crs, knownDefinition);
    }
  }
}

/**
 * Decodes CityJSON vertices while applying `transform`.
 *
 * @group Geometry
 * @param cityJson Input object.
 * @returns Decoded vertex list.
 */
function decodeVertices(cityJson: CityJSONV201): Vertex[] {
  const transform = cityJson.transform;

  const scale = transform?.scale;
  const translate = transform?.translate;

  if (!scale || !translate) {
    return cityJson.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]]);
  }

  return cityJson.vertices.map((vertex) => [
    vertex[0] * scale[0] + translate[0],
    vertex[1] * scale[1] + translate[1],
    vertex[2] * scale[2] + translate[2],
  ]);
}

/**
 * Transforms a vertex from a source CRS to a target CRS.
 *
 * @group Geometry
 * @param vertex Vertex to transform.
 * @param sourceCrs Source CRS.
 * @param targetCrs Target CRS.
 * @returns Transformed vertex.
 */
function projectVertex(vertex: Vertex, sourceCrs: string, targetCrs: string): Vertex {
  const projected = proj4(sourceCrs, targetCrs, [vertex[0], vertex[1]]) as [number, number];
  return [projected[0], projected[1], vertex[2]];
}

/**
 * Returns normalized (metric) vertices for geometry analysis.
 *
 * @group Geometry
 * @param cityJson Parsed CityJSON v2.0.1.
 * @param options CRS options with optional fallback.
 * @returns Vertex list in a suitable analysis CRS.
 */
export function normalizeVerticesForGeometry(
  cityJson: CityJSONV201,
  options: GeometryCrsOptions = {},
): Vertex[] {
  const decodedVertices = decodeVertices(cityJson);
  const referenceSystem = cityJson.metadata?.referenceSystem ?? options.sourceCrsFallback;
  const targetCrs = spatialConfig.analysisCrs;

  if (!referenceSystem) {
    ensureProjDefinition(targetCrs);
    return decodedVertices.map((vertex) => projectVertex(vertex, "EPSG:4326", targetCrs));
  }

  const sourceCrs = normalizeCrsCode(referenceSystem);
  if (!sourceCrs) {
    throw new Error(`Unsupported referenceSystem format: ${referenceSystem}`);
  }

  ensureProjDefinition(sourceCrs);
  ensureProjDefinition(targetCrs);

  if (sourceCrs === targetCrs) {
    return decodedVertices;
  }

  return decodedVertices.map((vertex) => projectVertex(vertex, sourceCrs, targetCrs));
}
