import type { Vertex } from "../shared/types.js";

export function vectorSubtract(a: Vertex, b: Vertex): Vertex {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function cross(a: Vertex, b: Vertex): Vertex {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a: Vertex, b: Vertex): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function magnitude(v: Vertex): number {
  return Math.sqrt(dot(v, v));
}

export function normalize(v: Vertex): Vertex | null {
  const len = magnitude(v);
  if (len === 0) {
    return null;
  }

  return [v[0] / len, v[1] / len, v[2] / len];
}
