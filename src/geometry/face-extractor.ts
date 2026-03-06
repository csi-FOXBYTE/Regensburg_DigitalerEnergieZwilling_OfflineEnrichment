import type { PolygonFace, Vertex } from "../shared/types.js";
import { isObject } from "../shared/guards.js";

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

function asVertex(index: number, vertices: Vertex[]): Vertex | null {
  const vertex = vertices[index];
  return vertex ?? null;
}

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
