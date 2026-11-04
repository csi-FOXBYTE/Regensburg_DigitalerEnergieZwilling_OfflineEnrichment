import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import { isObject, isVertex } from "../shared/guards.js";
import type { ProcessingLimits } from "./limits.js";

/**
 * CityJSON versions the analysis supports (2.0 and its patch releases).
 *
 * @group Validation
 */
const SUPPORTED_CITYJSON_VERSION = /^2\.0(\.\d+)?$/;

/**
 * Performs a lightweight structural validation for CityJSON documents.
 *
 * @group Validation
 * @param value Unknown value to validate.
 * @returns `true`, if the required base structure is present.
 */
export function isCityJsonLike(value: unknown): value is CityJSONV201 {
  if (!isObject(value)) {
    return false;
  }

  if (value.type !== "CityJSON") {
    return false;
  }

  if (!isObject(value.CityObjects)) {
    return false;
  }

  if (!Array.isArray(value.vertices)) {
    return false;
  }

  return value.vertices.every(isVertex);
}

function isFiniteTriple(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

/**
 * Checks every vertex index in a geometry's `boundaries` and the size of each
 * ring. Rings are the innermost arrays; every other level must contain arrays
 * only.
 *
 * @returns A reason, or `null` when all indices are valid.
 */
function validateBoundaries(
  boundaries: unknown,
  vertexCount: number,
  maxRingVertices: number,
): string | null {
  if (!Array.isArray(boundaries)) {
    return "Geometry boundaries must be an array.";
  }
  if (boundaries.length === 0 || Array.isArray(boundaries[0])) {
    for (const child of boundaries) {
      if (!Array.isArray(child)) {
        return "Geometry boundaries mix nested arrays and vertex indices.";
      }
      const reason = validateBoundaries(child, vertexCount, maxRingVertices);
      if (reason !== null) return reason;
    }
    return null;
  }
  if (boundaries.length > maxRingVertices) {
    return `A polygon ring has ${boundaries.length} vertices (limit ${maxRingVertices}).`;
  }
  for (const index of boundaries) {
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= vertexCount) {
      return `Invalid vertex index ${JSON.stringify(index)} (expected an integer from 0 to ${vertexCount - 1}).`;
    }
  }
  return null;
}

/**
 * Validates the content of a structurally valid CityJSON document against the
 * supported version, the processing limits and basic semantic rules: finite
 * vertex coordinates and transform values, a non-zero scale, and vertex
 * indices that are integers inside the vertex array. Accepting such input
 * produced `null` metrics, silently dropped geometry or absurd values.
 *
 * Nesting depth must be checked before parsing (see
 * `exceedsJsonNestingDepth`), as this function recurses into `boundaries`.
 *
 * @group Validation
 * @param cityJson Parsed document that passed {@link isCityJsonLike}.
 * @param limits Processing limits.
 * @returns A reason why the file must be skipped, or `null` if it is valid.
 */
export function validateCityJsonContent(
  cityJson: CityJSONV201,
  limits: Pick<ProcessingLimits, "maxCityObjects" | "maxVertices" | "maxRingVertices">,
): string | null {
  const version: unknown = cityJson.version;
  if (typeof version !== "string" || !SUPPORTED_CITYJSON_VERSION.test(version)) {
    return `Unsupported CityJSON version ${JSON.stringify(version ?? null)} (expected 2.0).`;
  }

  const cityObjectIds = Object.keys(cityJson.CityObjects);
  if (cityObjectIds.length > limits.maxCityObjects) {
    return `File has ${cityObjectIds.length} CityObjects (limit ${limits.maxCityObjects}).`;
  }

  const vertexCount = cityJson.vertices.length;
  if (vertexCount > limits.maxVertices) {
    return `File has ${vertexCount} vertices (limit ${limits.maxVertices}).`;
  }

  const transform: unknown = cityJson.transform;
  if (transform !== undefined) {
    if (!isObject(transform) || !isFiniteTriple(transform.scale) || !isFiniteTriple(transform.translate)) {
      return "transform.scale and transform.translate must each hold three finite numbers.";
    }
    if ((transform.scale as number[]).some((component) => component === 0)) {
      return "transform.scale must not contain zero.";
    }
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const vertex = cityJson.vertices[i]!;
    if (!Number.isFinite(vertex[0]) || !Number.isFinite(vertex[1]) || !Number.isFinite(vertex[2])) {
      return `Vertex ${i} has a non-finite coordinate.`;
    }
  }

  for (const id of cityObjectIds) {
    const cityObject: unknown = cityJson.CityObjects[id];
    if (!isObject(cityObject) || cityObject.geometry === undefined) continue;
    if (!Array.isArray(cityObject.geometry)) {
      return `CityObject ${JSON.stringify(id)}: geometry must be an array.`;
    }
    for (const geometry of cityObject.geometry as unknown[]) {
      if (!isObject(geometry)) {
        return `CityObject ${JSON.stringify(id)}: geometry entries must be objects.`;
      }
      const reason = validateBoundaries(geometry.boundaries, vertexCount, limits.maxRingVertices);
      if (reason !== null) {
        return `CityObject ${JSON.stringify(id)}: ${reason}`;
      }
    }
  }

  return null;
}
