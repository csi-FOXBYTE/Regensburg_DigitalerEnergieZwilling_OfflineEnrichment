import assert from "node:assert/strict";
import test from "node:test";

import { isGeothermalEnergyAvailableCategory } from "../../src/db/geothermal-zones-importer.js";

test("geothermal importer: 5 kW and higher capacity categories are available", () => {
  for (const category of [
    "5-10_kW",
    "10-25_kW",
    "25-50_kW",
    "50-100_kW",
    "100-250_kW",
    "500-750_kW",
  ]) {
    assert.equal(isGeothermalEnergyAvailableCategory(category), true, category);
  }
});

test("geothermal importer: low, unavailable, and exclusion categories are unavailable", () => {
  for (const category of [
    "<5_kW",
    "kein Potential",
    "Abstand zu klein",
    "innerhalb AG",
    "schneidet AG",
    null,
  ]) {
    assert.equal(isGeothermalEnergyAvailableCategory(category), false, String(category));
  }
});
