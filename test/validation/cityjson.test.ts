import assert from "node:assert/strict";
import test from "node:test";

import { isCityJsonLike } from "../../src/validation/cityjson.js";

test("validation/cityjson: accepts valid CityJSON-like object", () => {
  const cityJson = {
    type: "CityJSON",
    version: "2.0",
    CityObjects: {},
    vertices: [[0, 0, 0]],
    transform: {
      scale: [1, 1, 1],
      translate: [0, 0, 0],
    },
  };

  assert.equal(isCityJsonLike(cityJson), true);
});

test("validation/cityjson: rejects invalid object", () => {
  const invalid = {
    type: "FeatureCollection",
    CityObjects: [],
    vertices: [[0, 0]],
  };

  assert.equal(isCityJsonLike(invalid), false);
});
