import type { Vertex } from "./types.js";

/**
 * Checks whether a value is a non-null object.
 *
 * @group Shared
 * @param value Value to check.
 * @returns `true`, if the value is an object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Checks whether a value can be interpreted as a 3D vertex.
 *
 * @group Shared
 * @param value Value to check.
 * @returns `true`, if the value is a tuple with at least three numbers.
 */
export function isVertex(value: unknown): value is Vertex {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    typeof value[2] === "number"
  );
}
