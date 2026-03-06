import type { Vertex } from "../shared/types.js";
import { cross, dot, magnitude, normalize, vectorSubtract } from "./vector-math.js";

/**
 * Computes the area of a single ring by triangulation.
 *
 * @group Geometry
 * @param ring Closed or open ring as a point list.
 * @returns Ring area.
 */
function ringArea(ring: Vertex[]): number {
  if (ring.length < 3) {
    return 0;
  }

  const origin = ring[0]!;
  let area = 0;

  for (let i = 1; i < ring.length - 1; i += 1) {
    const v1 = vectorSubtract(ring[i]!, origin);
    const v2 = vectorSubtract(ring[i + 1]!, origin);
    area += 0.5 * magnitude(cross(v1, v2));
  }

  return area;
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

/**
 * Computes a normalized face normal of a ring (Newell method).
 *
 * @group Geometry
 * @param ring Ring as a point list.
 * @returns Normal vector or `null` for degenerate geometry.
 */
export function polygonNormal(ring: Vertex[]): Vertex | null {
  if (ring.length < 3) {
    return null;
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

  return normalize([nx, ny, nz]);
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
