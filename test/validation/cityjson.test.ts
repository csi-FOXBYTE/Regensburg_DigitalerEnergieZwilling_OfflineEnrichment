import assert from "node:assert/strict";
import test from "node:test";

import { isCityJsonLike, validateCityJsonContent } from "../../src/validation/cityjson.js";
import { DEFAULT_PROCESSING_LIMITS } from "../../src/validation/limits.js";

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

function triangleCityJson(overrides: Record<string, unknown> = {}): Parameters<typeof validateCityJsonContent>[0] {
  return {
    type: "CityJSON",
    version: "2.0",
    transform: { scale: [0.001, 0.001, 0.001], translate: [0, 0, 0] },
    CityObjects: {
      b1: {
        type: "Building",
        geometry: [{ type: "MultiSurface", lod: "2", boundaries: [[[0, 1, 2]]] }],
      },
    },
    vertices: [[0, 0, 0], [1000, 0, 0], [0, 1000, 0]],
    ...overrides,
  } as Parameters<typeof validateCityJsonContent>[0];
}

function withBoundaries(boundaries: unknown) {
  return triangleCityJson({
    CityObjects: { b1: { type: "Building", geometry: [{ type: "MultiSurface", lod: "2", boundaries }] } },
  });
}

test("validation/cityjson: accepts CityJSON 2.0 and its patch versions", () => {
  assert.equal(validateCityJsonContent(triangleCityJson(), DEFAULT_PROCESSING_LIMITS), null);
  assert.equal(validateCityJsonContent(triangleCityJson({ version: "2.0.1" }), DEFAULT_PROCESSING_LIMITS), null);
  assert.equal(validateCityJsonContent(triangleCityJson({ transform: undefined }), DEFAULT_PROCESSING_LIMITS), null);
});

test("validation/cityjson: rejects missing or unsupported versions", () => {
  for (const version of [undefined, "1.1", "99.0", "2.01", 2]) {
    assert.match(
      validateCityJsonContent(triangleCityJson({ version }), DEFAULT_PROCESSING_LIMITS) ?? "",
      /Unsupported CityJSON version/,
    );
  }
});

test("validation/cityjson: rejects non-finite vertices and transform values", () => {
  const infiniteVertex = triangleCityJson({ vertices: [[Infinity, 0, 0], [1, 0, 0], [0, 1, 0]] });
  assert.match(validateCityJsonContent(infiniteVertex, DEFAULT_PROCESSING_LIMITS) ?? "", /Vertex 0 has a non-finite/);
  for (const transform of [
    { scale: [Infinity, 1, 1], translate: [0, 0, 0] },
    { scale: [1, 1, 1], translate: [0, Number.NaN, 0] },
    { scale: [1, 1], translate: [0, 0, 0] },
    { translate: [0, 0, 0] },
  ]) {
    assert.match(validateCityJsonContent(triangleCityJson({ transform }), DEFAULT_PROCESSING_LIMITS) ?? "", /transform/);
  }
  const zeroScale = triangleCityJson({ transform: { scale: [0, 1, 1], translate: [0, 0, 0] } });
  assert.match(validateCityJsonContent(zeroScale, DEFAULT_PROCESSING_LIMITS) ?? "", /must not contain zero/);
});

test("validation/cityjson: rejects out-of-range, negative, fractional and non-numeric vertex indices", () => {
  for (const index of [3, -1, 0.5, "1", null]) {
    assert.match(
      validateCityJsonContent(withBoundaries([[[0, 1, index]]]), DEFAULT_PROCESSING_LIMITS) ?? "",
      /Invalid vertex index/,
    );
  }
  assert.match(
    validateCityJsonContent(withBoundaries([[[0, 1, 2], 3]]), DEFAULT_PROCESSING_LIMITS) ?? "",
    /mix nested arrays/,
  );
  assert.match(validateCityJsonContent(withBoundaries(7), DEFAULT_PROCESSING_LIMITS) ?? "", /must be an array/);
});

test("validation/cityjson: enforces object, vertex and ring-size limits", () => {
  const limits = { ...DEFAULT_PROCESSING_LIMITS };
  assert.match(validateCityJsonContent(triangleCityJson(), { ...limits, maxCityObjects: 0 }) ?? "", /1 CityObjects \(limit 0\)/);
  assert.match(validateCityJsonContent(triangleCityJson(), { ...limits, maxVertices: 2 }) ?? "", /3 vertices \(limit 2\)/);
  assert.match(
    validateCityJsonContent(triangleCityJson(), { ...limits, maxRingVertices: 2 }) ?? "",
    /ring has 3 vertices \(limit 2\)/,
  );
});
