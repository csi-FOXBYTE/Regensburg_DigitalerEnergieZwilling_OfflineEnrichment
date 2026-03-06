import type { PolygonFace, Vertex } from "../shared/types.js";
import { isObject } from "../shared/guards.js";

/**
 * Resolves the semantic surface type from a semantic reference.
 *
 * @group Geometry
 * @param semantics Semantics block of the geometry object.
 * @param semanticIndex Index in `semantics.surfaces`.
 * @returns Semantic type or `undefined`.
 */
function semanticTypeFromIndex(semantics: unknown, semanticIndex: unknown): string | undefined {
  if (typeof semanticIndex !== "number") {
    return undefined;
  }

  if (!isObject(semantics) || !Array.isArray(semantics.surfaces)) {
    return undefined;
  }

  const surface = semantics.surfaces[semanticIndex];
  if (!isObject(surface) || typeof surface.type !== "string") {
    return undefined;
  }

  return surface.type;
}

/**
 * Retrieves a vertex by index from the vertex array.
 *
 * @group Geometry
 * @param index Vertex index.
 * @param vertices Available vertex list.
 * @returns Vertex or `null` if the index is invalid.
 */
function asVertex(index: number, vertices: Vertex[]): Vertex | null {
  const vertex = vertices[index];
  return vertex ?? null;
}

/**
 * Converts CityJSON boundaries into a ring structure of vertex coordinates.
 *
 * @group Geometry
 * @param boundary Raw structure with vertex indices.
 * @param vertices Vertex list.
 * @returns Valid rings with at least three points.
 */
function indicesToRings(boundary: unknown, vertices: Vertex[]): Vertex[][] {
  if (!Array.isArray(boundary)) {
    return [];
  }

  const rings: Vertex[][] = [];

  for (const rawRing of boundary) {
    if (!Array.isArray(rawRing)) {
      continue;
    }

    const ring: Vertex[] = [];

    for (const index of rawRing) {
      if (typeof index !== "number") {
        continue;
      }

      const vertex = asVertex(index, vertices);
      if (vertex) {
        ring.push(vertex);
      }
    }

    if (ring.length >= 3) {
      rings.push(ring);
    }
  }

  return rings;
}

/**
 * Extracts polygonal faces from supported CityJSON geometry types.
 *
 * @group Geometry
 * @param geometry Geometry object of a CityObject.
 * @param vertices Normalized vertex list.
 * @returns Extracted faces including optional semantics.
 */
export function extractFacesFromGeometry(geometry: unknown, vertices: Vertex[]): PolygonFace[] {
  if (!isObject(geometry) || typeof geometry.type !== "string") {
    return [];
  }

  const faces: PolygonFace[] = [];
  const semantics = geometry.semantics;

  if ((geometry.type === "MultiSurface" || geometry.type === "CompositeSurface") && Array.isArray(geometry.boundaries)) {
    for (let surfaceIndex = 0; surfaceIndex < geometry.boundaries.length; surfaceIndex += 1) {
      const boundary = geometry.boundaries[surfaceIndex];
      const rings = indicesToRings(boundary, vertices);
      if (rings.length === 0) {
        continue;
      }

      const semanticIndex = isObject(semantics) && Array.isArray(semantics.values) ? semantics.values[surfaceIndex] : undefined;
      const semanticType = semanticTypeFromIndex(semantics, semanticIndex);
      faces.push({ rings, semanticType });
    }

    return faces;
  }

  if ((geometry.type === "Solid" || geometry.type === "CompositeSolid") && Array.isArray(geometry.boundaries)) {
    for (let shellIndex = 0; shellIndex < geometry.boundaries.length; shellIndex += 1) {
      const shell = geometry.boundaries[shellIndex];
      if (!Array.isArray(shell)) {
        continue;
      }

      for (let surfaceIndex = 0; surfaceIndex < shell.length; surfaceIndex += 1) {
        const boundary = shell[surfaceIndex];
        const rings = indicesToRings(boundary, vertices);
        if (rings.length === 0) {
          continue;
        }

        const semanticIndex =
          isObject(semantics) &&
          Array.isArray(semantics.values) &&
          Array.isArray(semantics.values[shellIndex])
            ? semantics.values[shellIndex][surfaceIndex]
            : undefined;

        const semanticType = semanticTypeFromIndex(semantics, semanticIndex);
        faces.push({ rings, semanticType });
      }
    }

    return faces;
  }

  if (geometry.type === "MultiSolid" && Array.isArray(geometry.boundaries)) {
    for (let solidIndex = 0; solidIndex < geometry.boundaries.length; solidIndex += 1) {
      const solid = geometry.boundaries[solidIndex];
      if (!Array.isArray(solid)) {
        continue;
      }

      for (let shellIndex = 0; shellIndex < solid.length; shellIndex += 1) {
        const shell = solid[shellIndex];
        if (!Array.isArray(shell)) {
          continue;
        }

        for (let surfaceIndex = 0; surfaceIndex < shell.length; surfaceIndex += 1) {
          const boundary = shell[surfaceIndex];
          const rings = indicesToRings(boundary, vertices);
          if (rings.length === 0) {
            continue;
          }

          const semanticIndex =
            isObject(semantics) &&
            Array.isArray(semantics.values) &&
            Array.isArray(semantics.values[solidIndex]) &&
            Array.isArray(semantics.values[solidIndex][shellIndex])
              ? semantics.values[solidIndex][shellIndex][surfaceIndex]
              : undefined;

          const semanticType = semanticTypeFromIndex(semantics, semanticIndex);
          faces.push({ rings, semanticType });
        }
      }
    }
  }

  return faces;
}
