import proj4 from "proj4";
import * as proj4ListModule from "proj4-list";

import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import type { GeometryCrsOptions, Vertex } from "../shared/types.js";

const proj4List = proj4ListModule as unknown as Record<string, [string, string]>;

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
 * Returns the underlying proj4 definition string of a CRS.
 *
 * @group Geometry
 * @param crs CRS code or direct proj4 definition.
 * @returns Definition string or `null` if it cannot be resolved.
 */
function getDefinitionString(crs: string): string | null {
  if (crs.includes("+proj=")) {
    return crs;
  }

  const fromProj4 = proj4.defs(crs);
  if (typeof fromProj4 === "string") {
    return fromProj4;
  }

  const fromList = proj4List[crs]?.[1];
  return fromList ?? null;
}

/**
 * Checks whether a CRS is geographic (lon/lat) instead of projected.
 *
 * @group Geometry
 * @param crs CRS to check.
 * @returns `true` if the CRS is geographic.
 */
function isGeographicCrs(crs: string): boolean {
  const definition = getDefinitionString(crs);
  if (!definition) {
    return false;
  }

  return definition.includes("+proj=longlat") || definition.includes("+proj=latlong");
}

/**
 * Computes the center of the XY bounding box as lon/lat.
 *
 * @group Geometry
 * @param vertices Vertex list in a geographic CRS.
 * @returns Center as `[lon, lat]`.
 */
function calculateBboxCenterLonLat(vertices: Vertex[]): [number, number] {
  if (vertices.length === 0) {
    throw new Error("Cannot infer CRS from empty vertex list.");
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex[0]);
    maxX = Math.max(maxX, vertex[0]);
    minY = Math.min(minY, vertex[1]);
    maxY = Math.max(maxY, vertex[1]);
  }

  const lon = (minX + maxX) / 2;
  const lat = (minY + maxY) / 2;

  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(
      "Cannot infer UTM zone automatically because coordinates are not plausible longitude/latitude values.",
    );
  }

  return [lon, lat];
}

/**
 * Infers a suitable UTM CRS from lon/lat coordinates.
 *
 * @group Geometry
 * @param vertices Vertex list in a geographic CRS.
 * @returns EPSG code of the inferred UTM zone.
 */
function inferUtmCrsFromLonLat(vertices: Vertex[]): string {
  const [lon, lat] = calculateBboxCenterLonLat(vertices);
  const zone = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
  const zoneStr = zone.toString().padStart(2, "0");
  const epsg = lat >= 0 ? `EPSG:326${zoneStr}` : `EPSG:327${zoneStr}`;

  ensureProjDefinition(epsg);
  return epsg;
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

  if (!referenceSystem) {
    const inferredUtm = inferUtmCrsFromLonLat(decodedVertices);
    return decodedVertices.map((vertex) => projectVertex(vertex, "EPSG:4326", inferredUtm));
  }

  const sourceCrs = normalizeCrsCode(referenceSystem);
  if (!sourceCrs) {
    throw new Error(`Unsupported referenceSystem format: ${referenceSystem}`);
  }

  ensureProjDefinition(sourceCrs);

  if (!isGeographicCrs(sourceCrs)) {
    return decodedVertices;
  }

  const inferredUtm = inferUtmCrsFromLonLat(decodedVertices);
  return decodedVertices.map((vertex) => projectVertex(vertex, sourceCrs, inferredUtm));
}
