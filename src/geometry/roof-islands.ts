import type { PolygonFace, Vertex } from "../shared/types.js";
import { polygonArea } from "./polygon-math.js";
import { cross, dot, magnitude, vectorSubtract } from "./vector-math.js";

const EDGE_TOLERANCE_M = 0.01;
const NUMERIC_EPSILON = 1e-9;

interface RoofEdge {
  faceIndex: number;
  start: Vertex;
  end: Vertex;
  direction: Vertex;
  length: number;
  min: Vertex;
  max: Vertex;
}

interface RoofIsland {
  faces: PolygonFace[];
  area: number;
  minHeight: number;
}

function makeEdge(start: Vertex, end: Vertex, faceIndex: number): RoofEdge | null {
  const delta = vectorSubtract(end, start);
  const length = magnitude(delta);
  if (length <= NUMERIC_EPSILON) return null;
  return {
    faceIndex, start, end, length,
    direction: [delta[0] / length, delta[1] / length, delta[2] / length],
    min: [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.min(start[2], end[2])],
    max: [Math.max(start[0], end[0]), Math.max(start[1], end[1]), Math.max(start[2], end[2])],
  };
}

function overlapsAlongLine(longer: RoofEdge, shorter: RoofEdge): boolean {
  const start = vectorSubtract(shorter.start, longer.start);
  const end = vectorSubtract(shorter.end, longer.start);
  // Require the shorter edge to follow the longer edge's supporting line.
  // Merely crossing it or having nearby endpoints does not establish a seam.
  const tolerance = EDGE_TOLERANCE_M + NUMERIC_EPSILON;
  if (magnitude(cross(start, longer.direction)) > tolerance ||
      magnitude(cross(end, longer.direction)) > tolerance) return false;

  const p = dot(start, longer.direction);
  const q = dot(end, longer.direction);
  const overlap = Math.min(longer.length, Math.max(p, q)) - Math.max(0, Math.min(p, q));
  // Do not extend segment endpoints by the matching tolerance: point-only
  // contact and small gaps along the edge must not connect separate roofs.
  return overlap > NUMERIC_EPSILON;
}

function sharesEdgeSegment(a: RoofEdge, b: RoofEdge): boolean {
  if (Math.abs(a.length - b.length) <= NUMERIC_EPSILON) {
    return overlapsAlongLine(a, b) && overlapsAlongLine(b, a);
  }
  return a.length > b.length ? overlapsAlongLine(a, b) : overlapsAlongLine(b, a);
}

/**
 * Groups roof faces connected by shared 3D boundary segments within 1 cm.
 * Partial edges and inner-ring boundaries count; point-only contact does not.
 * Returns islands ordered by descending combined surface area. Equal areas
 * are ordered by lowest elevation so selection is independent of face order.
 *
 * @group Geometry
 * @param faces Building faces in metric coordinates.
 * @returns Roof islands with their combined areas and minimum elevations.
 */
export function findRoofIslands(faces: PolygonFace[]): RoofIsland[] {
  const roofs = faces
    .filter((face) => face.semanticType === "RoofSurface")
    .map((face) => ({ face, area: polygonArea(face.rings) }))
    .filter(({ area }) => area > 0);
  const parents = roofs.map((_, i) => i);
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  };

  const edges: RoofEdge[] = [];
  for (const [index, { face }] of roofs.entries()) {
    for (const ring of face.rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const edge = makeEdge(ring[i]!, ring[(i + 1) % ring.length]!, index);
        if (edge) edges.push(edge);
      }
    }
  }
  edges.sort((a, b) => a.min[0] - b.min[0]);
  const tolerance = EDGE_TOLERANCE_M + NUMERIC_EPSILON;
  for (let i = 0; i < edges.length; i += 1) {
    const a = edges[i]!;
    for (let j = i + 1; j < edges.length; j += 1) {
      const b = edges[j]!;
      if (b.min[0] > a.max[0] + tolerance) break;
      const rootA = root(a.faceIndex);
      const rootB = root(b.faceIndex);
      if (rootA === rootB) continue;
      if (b.min[1] > a.max[1] + tolerance || a.min[1] > b.max[1] + tolerance ||
          b.min[2] > a.max[2] + tolerance || a.min[2] > b.max[2] + tolerance) continue;
      if (sharesEdgeSegment(a, b)) parents[rootB] = rootA;
    }
  }

  const islands = new Map<number, RoofIsland>();
  for (const [index, { face, area }] of roofs.entries()) {
    const key = root(index);
    let island = islands.get(key);
    if (!island) {
      island = { faces: [], area: 0, minHeight: Number.POSITIVE_INFINITY };
      islands.set(key, island);
    }
    island.faces.push(face);
    island.area += area;
    for (const ring of face.rings) {
      for (const vertex of ring) island.minHeight = Math.min(island.minHeight, vertex[2]);
    }
  }
  return [...islands.values()].sort((a, b) => b.area - a.area || a.minHeight - b.minHeight);
}
