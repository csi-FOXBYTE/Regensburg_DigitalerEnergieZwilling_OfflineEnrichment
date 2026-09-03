import { isObject } from "../../shared/guards.js";
import { buildingConfig } from "../building.js";

export interface BuildingAddress {
  street: string;
  houseNumber: string;
}

export interface AdaptedBuildingFeature {
  addresses: BuildingAddress[];
  isValidBuilding: boolean;
}

/** Splits municipality-specific thoroughfare strings into address records. */
export function parseThoroughfare(thoroughfare: string): BuildingAddress[] {
  const results: BuildingAddress[] = [];

  for (const segment of thoroughfare.split(";")) {
    const trimmed = segment.trim();
    const separatorIndex = trimmed.lastIndexOf(" ");
    if (separatorIndex < 0) continue;

    const houseNumbers = trimmed.slice(separatorIndex + 1);
    if (!/^\d/.test(houseNumbers)) continue;

    const street = trimmed.slice(0, separatorIndex);
    for (const houseNumber of houseNumbers.split(",")) {
      results.push({ street, houseNumber });
    }
  }

  return results;
}

function addressProperty(feature: Record<string, unknown>): BuildingAddress[] {
  if (!Array.isArray(feature.address)) return [];

  for (const entry of feature.address) {
    if (!isObject(entry) || typeof entry.ThoroughfareName !== "string") continue;
    return parseThoroughfare(entry.ThoroughfareName);
  }

  return [];
}

function functionProperty(feature: Record<string, unknown>): unknown {
  return isObject(feature.attributes) ? feature.attributes.function : undefined;
}

/** Reads the municipality identifier used by the input CityJSON dataset. */
export function adaptMunicipalityKey(feature: Record<string, unknown>): string | undefined {
  if (!isObject(feature.attributes)) return undefined;

  const municipalityKey = feature.attributes.Gemeindeschluessel;
  return typeof municipalityKey === "string" ? municipalityKey : undefined;
}

/**
 * Converts municipality-specific CityJSON properties to the processing
 * contract. Other municipalities only need to replace the mappings here.
 */
export function adaptBuildingFeature(feature: Record<string, unknown>): AdaptedBuildingFeature {
  const buildingFunction = functionProperty(feature);

  return {
    addresses: addressProperty(feature),
    isValidBuilding: String(buildingFunction ?? "").startsWith(
      buildingConfig.selectableFunctionPrefix,
    ),
  };
}
