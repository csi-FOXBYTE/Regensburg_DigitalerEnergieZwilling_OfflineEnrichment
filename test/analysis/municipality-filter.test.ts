import assert from "node:assert/strict";
import test from "node:test";

import { filterCityObjectsByMunicipality } from "../../src/analysis/municipality-filter.js";
import type { CityJSONV201 } from "../../src/types/cityjson_2_0_1.js";

function cityJsonFixture(): CityJSONV201 {
  return {
    type: "CityJSON",
    version: "2.0",
    CityObjects: {
      kept: {
        type: "Building",
        attributes: { Gemeindeschluessel: "09362000" },
        children: ["kept-part", "removed-part"],
      },
      "kept-part": {
        type: "BuildingPart",
        attributes: { Gemeindeschluessel: "09362000" },
        parents: ["kept"],
      },
      removed: {
        type: "Building",
        attributes: { Gemeindeschluessel: "09375181" },
      },
      "removed-part": {
        type: "BuildingPart",
        attributes: { Gemeindeschluessel: "09375181" },
        parents: ["kept"],
      },
      missing: {
        type: "Building",
        attributes: {},
      },
      group: {
        type: "CityObjectGroup",
        attributes: { Gemeindeschluessel: "09362000" },
        children: ["kept", "removed", "kept-part"],
        children_roles: ["primary", "secondary", "part"],
      },
      road: {
        type: "Road",
        attributes: { Gemeindeschluessel: "09362000" },
        children: ["removed"],
      },
      "outside-road": {
        type: "Road",
        attributes: { Gemeindeschluessel: "09375181" },
      },
      "unclassified-land-use": {
        type: "LandUse",
        attributes: {},
      },
    },
    vertices: [],
    transform: {
      scale: [1, 1, 1],
      translate: [0, 0, 0],
    },
  };
}

test("municipality filter: retains exact matches of every type", () => {
  const parsed = cityJsonFixture();

  filterCityObjectsByMunicipality(parsed, "09362000");

  assert.deepEqual(Object.keys(parsed.CityObjects).sort(), ["group", "kept", "kept-part", "road"]);
});

test("municipality filter: removes dangling relationships and keeps group roles aligned", () => {
  const parsed = cityJsonFixture();

  filterCityObjectsByMunicipality(parsed, "09362000");

  const kept = parsed.CityObjects.kept;
  const group = parsed.CityObjects.group;
  const road = parsed.CityObjects.road;

  assert.deepEqual(kept?.children, ["kept-part"]);
  assert.deepEqual(group?.children, ["kept", "kept-part"]);
  assert.deepEqual(group?.children_roles, ["primary", "part"]);
  assert.equal("children" in (road ?? {}), false);
});

test("municipality filter: rejects an empty key", () => {
  const parsed = cityJsonFixture();

  assert.throws(
    () => filterCityObjectsByMunicipality(parsed, "  "),
    /municipalityKey must not be empty/,
  );
});
