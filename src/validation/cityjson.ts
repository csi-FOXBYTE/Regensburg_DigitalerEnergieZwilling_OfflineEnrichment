import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";
import { isObject, isVertex } from "../shared/guards.js";

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
