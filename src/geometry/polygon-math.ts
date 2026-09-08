import type { Vertex } from "../shared/types.js";
import { cross, dot, magnitude, normalize, vectorSubtract } from "./vector-math.js";

/**
 * Computes Newell's unnormalized area vector for a ring.
 *
 * Half the vector magnitude is the area of a planar ring and its direction
 * follows the ring winding.
 *
 * @param ring Closed or open ring as a point list.
 * @returns Twice the oriented area vector.
 */
function newellAreaVector(ring: Vertex[]): Vertex {
  if (ring.length < 3) {
    return [0, 0, 0];
  }

  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const curr = ring[i]!;
    const next = ring[(i + 1) % ring.length]!;
    nx += (curr[1] - next[1]) * (curr[2] + next[2]);
    ny += (curr[2] - next[2]) * (curr[0] + next[0]);
    nz += (curr[0] - next[0]) * (curr[1] + next[1]);
  }

  return [nx, ny, nz];
}

/**
 * Computes the area of a planar ring using Newell's method.
 *
 * @group Geometry
 * @param ring Closed or open ring as a point list.
 * @returns Ring area.
 */
function ringArea(ring: Vertex[]): number {
  return 0.5 * magnitude(newellAreaVector(ring));
}

/**
 * Computes the signed volume contribution of a ring relative to the origin.
 *
 * @group Geometry
 * @param ring Ring as a point list.
 * @returns Signed volume contribution.
 */
function ringSignedVolumeContribution(ring: Vertex[]): number {
  if (ring.length < 3) {
    return 0;
  }

  const origin = ring[0]!;
  let volume = 0;

  for (let i = 1; i < ring.length - 1; i += 1) {
    const b = ring[i]!;
    const c = ring[i + 1]!;
    volume += dot(origin, cross(b, c)) / 6;
  }

  return volume;
}

/**
 * Computes polygon area as outer ring minus inner rings.
 *
 * @group Geometry
 * @param rings Ring list where the first ring is the outer ring.
 * @returns Non-negative polygon area.
 */
export function polygonArea(rings: Vertex[][]): number {
  if (rings.length === 0) {
    return 0;
  }

  const outerArea = ringArea(rings[0]!);
  const holes = rings.slice(1).reduce((sum, hole) => sum + ringArea(hole), 0);
  return Math.max(0, outerArea - holes);
}

/** Clips a ring to the horizontal half-space at or below the given elevation. */
function clipRingBelowHeight(ring: Vertex[], height: number): Vertex[] {
  const clipped: Vertex[] = [];

  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i]!;
    const previous = ring[(i + ring.length - 1) % ring.length]!;
    const currentInside = current[2] <= height;
    const previousInside = previous[2] <= height;

    if (currentInside !== previousInside) {
      const t = (height - previous[2]) / (current[2] - previous[2]);
      clipped.push([
        previous[0] + t * (current[0] - previous[0]),
        previous[1] + t * (current[1] - previous[1]),
        height,
      ]);
    }
    if (currentInside) clipped.push(current);
  }

  return clipped;
}

/**
 * Computes the area at or below a horizontal cut, including clipped holes.
 * Concave rings may become disconnected; their connecting cut edges cancel
 * in Newell's area vector.
 *
 * @group Geometry
 * @param rings Polygon rings, outer ring first.
 * @param height Absolute elevation in the same coordinate system as the vertices.
 * @returns Non-negative area below the cut.
 */
export function polygonAreaBelowHeight(rings: Vertex[][], height: number): number {
  // Decoding a CityJSON transform can put an equal eaves elevation a few ULPs
  // below the wall top. Avoid manufacturing a tiny attic strip in that case.
  if (rings.every((ring) => ring.every((vertex) => vertex[2] <= height + 1e-9))) {
    return polygonArea(rings);
  }
  return polygonArea(rings.map((ring) => clipRingBelowHeight(ring, height)));
}

/**
 * Computes a normalized face normal of a ring (Newell method).
 *
 * @group Geometry
 * @param ring Ring as a point list.
 * @returns Normal vector or `null` for degenerate geometry.
 */
export function polygonNormal(ring: Vertex[]): Vertex | null {
  return normalize(newellAreaVector(ring));
}

/**
 * Sums signed volume contributions across all rings.
 *
 * @group Geometry
 * @param rings Ring list of a polygon.
 * @returns Signed volume contribution.
 */
export function polygonSignedVolumeContribution(rings: Vertex[][]): number {
  return rings.reduce((sum, ring) => sum + ringSignedVolumeContribution(ring), 0);
}

type Vec2 = [number, number];

const MAX_OPPOSING_NORMAL_DEVIATION_RADIANS = Math.PI / 180;
const OPPOSING_NORMAL_DOT_LIMIT = -Math.cos(MAX_OPPOSING_NORMAL_DEVIATION_RADIANS);
const NORMAL_DOT_EPSILON = 1e-12;
const PLANE_DISTANCE_EPSILON = 1e-9;

function projectVertex(v: Vertex, u: Vertex, w: Vertex): Vec2 {
  return [dot(v, u), dot(v, w)];
}

function localBasis(normal: Vertex): [Vertex, Vertex] {
  const ref: Vertex = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(normal, ref))!;
  const w = cross(normal, u);
  return [u, w];
}

function signedArea2d(poly: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function isLeftOfEdge(p: Vec2, a: Vec2, b: Vec2): boolean {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
}

function edgeIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const denom = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / denom;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function sutherlandHodgman(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) return [];
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const curr = input[j]!;
      const prev = input[(j + input.length - 1) % input.length]!;
      const currIn = isLeftOfEdge(curr, a, b);
      const prevIn = isLeftOfEdge(prev, a, b);
      if (currIn) {
        if (!prevIn) {
          const ix = edgeIntersect(prev, curr, a, b);
          if (ix) output.push(ix);
        }
        output.push(curr);
      } else if (prevIn) {
        const ix = edgeIntersect(prev, curr, a, b);
        if (ix) output.push(ix);
      }
    }
  }
  return output;
}

/**
 * Computes the shared area between two 3D wall face polygons using symmetric
 * projection onto the average plane of their normals followed by
 * Sutherland-Hodgman polygon clipping. Normals must oppose within 1 degree,
 * and every vertex must lie within tolerance of the other face's plane.
 *
 * @group Geometry
 * @param faceA Outer ring vertices of the first wall face.
 * @param faceB Outer ring vertices of the second wall face.
 * @param distanceTolerance Maximum separation from the other wall's plane in metres.
 * @returns Shared area in square units of the CRS, or 0 if the faces do not overlap.
 */
export function wallFaceIntersectionArea(
  faceA: Vertex[],
  faceB: Vertex[],
  distanceTolerance = 0.15,
): number {
  const nA = polygonNormal(faceA);
  const nB = polygonNormal(faceB);
  if (!nA || !nB) return 0;

  // Edge contact between perpendicular walls must not become projected overlap.
  if (dot(nA, nB) > OPPOSING_NORMAL_DOT_LIMIT + NORMAL_DOT_EPSILON) return 0;

  const originA = faceA[0]!;
  const originB = faceB[0]!;
  const maxDistance = distanceTolerance + PLANE_DISTANCE_EPSILON;
  if (
    faceA.some((v) => Math.abs(dot(vectorSubtract(v, originB), nB)) > maxDistance) ||
    faceB.some((v) => Math.abs(dot(vectorSubtract(v, originA), nA)) > maxDistance)
  ) return 0;

  // Adjacent wall faces have opposing normals; subtracting gives a stable average direction
  const nAvg = normalize(vectorSubtract(nA, nB));
  if (!nAvg) return 0;

  const [u, w] = localBasis(nAvg);
  // Keep clipping coordinates local to avoid cancellation with large CRS coordinates.
  const projA = faceA.map((v) => projectVertex(vectorSubtract(v, originA), u, w));
  const projB = faceB.map((v) => projectVertex(vectorSubtract(v, originA), u, w));

  // Sutherland-Hodgman requires the clip polygon to be CCW
  const clipB = signedArea2d(projB) >= 0 ? projB : [...projB].reverse();
  const clipped = sutherlandHodgman(projA, clipB);
  return Math.abs(signedArea2d(clipped));
}
