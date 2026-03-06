import type { Vertex } from "../shared/types.js";

/**
 * Subtracts two 3D vectors component-wise.
 *
 * @group Geometry
 * @param a Minuend.
 * @param b Subtrahend.
 * @returns Result vector `a - b`.
 */
export function vectorSubtract(a: Vertex, b: Vertex): Vertex {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Computes the cross product of two 3D vectors.
 *
 * @group Geometry
 * @param a First vector.
 * @param b Second vector.
 * @returns Cross product `a x b`.
 */
export function cross(a: Vertex, b: Vertex): Vertex {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Computes the dot product of two 3D vectors.
 *
 * @group Geometry
 * @param a First vector.
 * @param b Second vector.
 * @returns Dot product.
 */
export function dot(a: Vertex, b: Vertex): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Computes the Euclidean magnitude of a 3D vector.
 *
 * @group Geometry
 * @param v Input vector.
 * @returns Vector magnitude.
 */
export function magnitude(v: Vertex): number {
  return Math.sqrt(dot(v, v));
}

/**
 * Normalizes a 3D vector to unit length.
 *
 * @group Geometry
 * @param v Input vector.
 * @returns Normalized vector or `null` for the zero vector.
 */
export function normalize(v: Vertex): Vertex | null {
  const len = magnitude(v);
  if (len === 0) {
    return null;
  }

  return [v[0] / len, v[1] / len, v[2] / len];
}
