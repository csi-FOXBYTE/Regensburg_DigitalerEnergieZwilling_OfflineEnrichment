import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptBuildingFeature,
  adaptMunicipalityKey,
} from "../../src/config/adapters/buildingFeature.js";

test("building feature adapter: extracts addresses and marks target functions valid", () => {
  assert.deepEqual(
    adaptBuildingFeature({
      attributes: { function: "31001_1000_annex" },
      address: [{ ThoroughfareName: "Hauptstraße 5,5a" }],
    }),
    {
      addresses: [
        { street: "Hauptstraße", houseNumber: "5" },
        { street: "Hauptstraße", houseNumber: "5a" },
      ],
      isValidBuilding: true,
    },
  );
});

test("building feature adapter: tolerates missing and differently shaped properties", () => {
  assert.deepEqual(
    adaptBuildingFeature({
      attributes: { function: "31001_2000" },
      address: { ThoroughfareName: "Unexpected shape 1" },
    }),
    { addresses: [], isValidBuilding: false },
  );

  assert.deepEqual(adaptBuildingFeature({}), {
    addresses: [],
    isValidBuilding: false,
  });
});

test("building feature adapter: extracts the configured source municipality key", () => {
  assert.equal(
    adaptMunicipalityKey({ attributes: { Gemeindeschluessel: "09362000" } }),
    "09362000",
  );
  assert.equal(adaptMunicipalityKey({ attributes: { Gemeindeschluessel: 9362000 } }), undefined);
  assert.equal(adaptMunicipalityKey({}), undefined);
});
