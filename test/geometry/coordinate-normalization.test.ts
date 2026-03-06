import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVerticesForGeometry } from "../../src/geometry/coordinate-normalization.js";

function createBaseCityJson(vertices: [number, number, number][]) {
  return {
    type: "CityJSON",
    version: "2.0",
    CityObjects: {},
    vertices,
    transform: {
      scale: [1, 1, 1],
      translate: [0, 0, 0],
    },
  };
}

test("geometry/coordinate-normalization: keeps projected coordinates unchanged", () => {
  const cityJson = {
    ...createBaseCityJson([[450000, 5430000, 100]]),
    metadata: { referenceSystem: "EPSG:25832" },
  };

  const out = normalizeVerticesForGeometry(cityJson as never);
  assert.deepEqual(out[0], [450000, 5430000, 100]);
});

test("geometry/coordinate-normalization: infers UTM from lon/lat when CRS is missing", () => {
  const cityJson = createBaseCityJson([[12.1, 49.0, 300], [12.2, 49.1, 305]]);

  const out = normalizeVerticesForGeometry(cityJson as never);


  assert.equal(out.length, 2);
  assert.ok(Number.isFinite(out[0]?.[0]));
  assert.ok(Number.isFinite(out[0]?.[1]));
  assert.ok(Number.isFinite(out[0]?.[2]));
  assert.ok(out[0]![0] > 100000);
  assert.ok(out[0]![1] > 1000000);
  assert.equal(out[0]![2], 300);
});
