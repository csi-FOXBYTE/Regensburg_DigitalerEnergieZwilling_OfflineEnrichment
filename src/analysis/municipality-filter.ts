import { adaptMunicipalityKey } from "../config/adapters/buildingFeature.js";
import { isObject } from "../shared/guards.js";
import type { CityJSONV201 } from "../types/cityjson_2_0_1.js";

/**
 * Removes CityObjects outside the requested municipality and cleans references
 * to the removed CityObjects from the remaining document.
 *
 * CityObjects without an adapter-provided municipality key are excluded when
 * this strict filter is active, regardless of their type.
 *
 * @group Analysis
 * @param cityJson Parsed CityJSON document to filter in place.
 * @param municipalityKey Exact adapter-provided municipality key to retain.
 */
export function filterCityObjectsByMunicipality(
  cityJson: CityJSONV201,
  municipalityKey: string,
): void {
  const normalizedKey = municipalityKey.trim();
  if (normalizedKey.length === 0) {
    throw new Error("municipalityKey must not be empty");
  }

  for (const [cityObjectId, cityObject] of Object.entries(cityJson.CityObjects)) {
    if (!isObject(cityObject) || adaptMunicipalityKey(cityObject) !== normalizedKey) {
      delete cityJson.CityObjects[cityObjectId];
    }
  }

  const retainedIds = new Set(Object.keys(cityJson.CityObjects));

  for (const cityObject of Object.values(cityJson.CityObjects)) {
    if (!isObject(cityObject)) continue;

    if (Array.isArray(cityObject.children)) {
      const retainedChildIndices: number[] = [];
      const retainedChildren: string[] = [];

      for (const [index, childId] of cityObject.children.entries()) {
        if (typeof childId !== "string" || !retainedIds.has(childId)) continue;
        retainedChildIndices.push(index);
        retainedChildren.push(childId);
      }

      if (retainedChildren.length > 0) {
        cityObject.children = retainedChildren;
      } else {
        delete cityObject.children;
      }

      if (Array.isArray(cityObject.children_roles)) {
        const childrenRoles = cityObject.children_roles;
        if (retainedChildren.length > 0) {
          cityObject.children_roles = retainedChildIndices.map(
            (index) => childrenRoles[index] ?? null,
          );
        } else {
          delete cityObject.children_roles;
        }
      }
    }

    if (Array.isArray(cityObject.parents)) {
      const retainedParents = cityObject.parents.filter(
        (parentId): parentId is string =>
          typeof parentId === "string" && retainedIds.has(parentId),
      );

      if (retainedParents.length > 0) {
        cityObject.parents = retainedParents;
      } else {
        delete cityObject.parents;
      }
    }
  }
}
