import assert from "node:assert/strict";
import test from "node:test";

import { calculateBuildingGeometryMetrics } from "../../src/geometry/building-metrics.js";
import type { PolygonFace } from "../../src/shared/types.ts";

const faces: PolygonFace[] = [
  { semanticType: "GroundSurface", rings: [[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]] },
  { semanticType: "RoofSurface", rings: [[[0, 0, 2], [0, 1, 2], [1, 1, 2], [1, 0, 2]]] },
  { semanticType: "WallSurface", rings: [[[0, 0, 0], [1, 0, 0], [1, 0, 2], [0, 0, 2]]] },
  { semanticType: "WallSurface", rings: [[[1, 0, 0], [1, 1, 0], [1, 1, 2], [1, 0, 2]]] },
  { semanticType: "WallSurface", rings: [[[1, 1, 0], [0, 1, 0], [0, 1, 2], [1, 1, 2]]] },
  { semanticType: "WallSurface", rings: [[[0, 1, 0], [0, 0, 0], [0, 0, 2], [0, 1, 2]]] },
];

test("geometry/building-metrics: calculates envelope, areas and height", () => {
  const metrics = calculateBuildingGeometryMetrics(faces);

  assert.equal(metrics.groundArea, 1);
  assert.equal(metrics.upperFloorArea, 1);
  assert.equal(metrics.roofArea, 1);
  assert.equal(metrics.grossExternalWallArea, 8);
  assert.equal(metrics.grossExternalWallAreaWithoutAttic, 8);
  assert.equal(metrics.grossExternalWallAreaAttic, 0);
  assert.equal(metrics.envelopeArea, 10);
  assert.equal(metrics.height, 2);
  assert.equal(metrics.lowestEavesHeight, 2);
  assert.equal(metrics.roofPitchDegrees, 0);
  assert.ok(metrics.volume > 0);
});

test("geometry/building-metrics: preserves volume for a concave prism", () => {
  const footprint: [number, number][] = [
    [0, 0],
    [3, 0],
    [3, 3],
    [2, 3],
    [2, 1],
    [1, 1],
    [1, 3],
    [0, 3],
  ];
  const bottom = footprint.map(([x, y]): [number, number, number] => [x, y, 0]);
  const top = footprint.map(([x, y]): [number, number, number] => [x, y, 2]);
  const prismFaces: PolygonFace[] = [
    { semanticType: "GroundSurface", rings: [[...bottom].reverse()] },
    { semanticType: "RoofSurface", rings: [top] },
  ];

  for (let i = 0; i < footprint.length; i += 1) {
    const next = (i + 1) % footprint.length;
    prismFaces.push({
      semanticType: "WallSurface",
      rings: [[bottom[i]!, bottom[next]!, top[next]!, top[i]!]],
    });
  }

  const metrics = calculateBuildingGeometryMetrics(prismFaces);

  assert.equal(metrics.groundArea, 7);
  assert.equal(metrics.roofArea, 7);
  assert.ok(Math.abs(metrics.volume - 14) < 1e-9);
});

const gableFaces: PolygonFace[] = [
  { semanticType: "WallSurface", rings: [[[0, 0, 0], [4, 0, 0], [4, 0, 2], [2, 0, 4], [0, 0, 2]]] },
  { semanticType: "RoofSurface", rings: [[[0, 0, 2], [2, 0, 4], [2, 3, 4], [0, 3, 2]]] },
];

test("geometry/building-metrics: splits a gable using the lowest roof vertex", () => {
  const metrics = calculateBuildingGeometryMetrics(gableFaces);
  assert.equal(metrics.grossExternalWallArea, 12);
  assert.equal(metrics.grossExternalWallAreaWithoutAttic, 8);
  assert.equal(metrics.grossExternalWallAreaAttic, 4);
});

test("geometry/building-metrics: a detached low roof does not lower the attic split", () => {
  const canopy: PolygonFace = { semanticType: "RoofSurface", rings: [[[10, 0, 0.5], [11, 0, 0.5], [11, 1, 0.5], [10, 1, 0.5]]] };
  const metrics = calculateBuildingGeometryMetrics([canopy, ...gableFaces]);
  assert.equal(metrics.grossExternalWallArea, 12);
  assert.equal(metrics.grossExternalWallAreaWithoutAttic, 8);
  assert.equal(metrics.grossExternalWallAreaAttic, 4);
});

test("geometry/building-metrics: eaves at the very top leave exactly zero attic wall area", () => {
  for (const elevation of [4, 5]) {
    const roof: PolygonFace = {
      semanticType: "RoofSurface",
      rings: [[[0, 0, elevation], [4, 0, elevation], [4, 3, elevation], [0, 3, elevation]]],
    };
    const metrics = calculateBuildingGeometryMetrics([gableFaces[0]!, roof]);
    assert.equal(metrics.grossExternalWallArea, 12);
    assert.equal(metrics.grossExternalWallAreaWithoutAttic, metrics.grossExternalWallArea);
    assert.equal(metrics.grossExternalWallAreaAttic, 0);
  }
});

test("geometry/building-metrics: coordinate rounding at the eaves does not create an attic strip", () => {
  const translatedFaces = faces.map((face): PolygonFace => ({
    ...face,
    rings: face.rings.map((ring) => ring.map(([x, y, z]) => [
      x + 720000, y + 5432000, z + 350 + (face.semanticType === "WallSurface" ? 1e-12 : 0),
    ])),
  }));
  const metrics = calculateBuildingGeometryMetrics(translatedFaces);
  assert.equal(metrics.grossExternalWallAreaAttic, 0);
  assert.equal(metrics.grossExternalWallAreaWithoutAttic, metrics.grossExternalWallArea);
});

test("geometry/building-metrics: missing roofs leave the split unknown", () => {
  const wallsOnly = gableFaces.filter((face) => face.semanticType === "WallSurface");
  const unknown = calculateBuildingGeometryMetrics(wallsOnly);
  assert.equal(unknown.grossExternalWallArea, 12);
  assert.equal(unknown.grossExternalWallAreaWithoutAttic, null);
  assert.equal(unknown.grossExternalWallAreaAttic, null);
});

test("geometry/building-metrics: degenerate low roof faces do not lower the split", () => {
  const invalid: PolygonFace = { semanticType: "RoofSurface", rings: [[[0, 0, 0], [1, 0, 0], [2, 0, 0]]] };
  const metrics = calculateBuildingGeometryMetrics([invalid, ...gableFaces]);
  assert.equal(metrics.grossExternalWallAreaWithoutAttic, 8);
  assert.equal(metrics.grossExternalWallAreaAttic, 4);
});

test("geometry/building-metrics: the split uses the same wall filter as the original total", () => {
  const horizontalWall: PolygonFace = {
    semanticType: "WallSurface", rings: [[[0, 0, 1], [4, 0, 1], [4, 4, 1], [0, 4, 1]]],
  };
  const metrics = calculateBuildingGeometryMetrics([...gableFaces, horizontalWall]);
  assert.equal(metrics.grossExternalWallArea, 12);
  assert.equal(metrics.grossExternalWallAreaWithoutAttic, 8);
  assert.equal(metrics.grossExternalWallAreaAttic, 4);
});

test("geometry/building-metrics: exports the main roof eaves relative to the lowest ground elevation", () => {
  const ground: PolygonFace = {
    semanticType: "GroundSurface",
    rings: [[[0, 0, 0], [4, 0, 1], [4, 3, 1], [0, 3, 0]]],
  };
  const canopy: PolygonFace = {
    semanticType: "RoofSurface",
    rings: [[[10, 0, 0.5], [11, 0, 0.5], [11, 1, 0.5], [10, 1, 0.5]]],
  };
  for (const elevationOffset of [0, 350]) {
    const translated = [ground, canopy, ...gableFaces].map((face): PolygonFace => ({
      ...face,
      rings: face.rings.map((ring) => ring.map(([x, y, z]) => [x, y, z + elevationOffset])),
    }));
    const metrics = calculateBuildingGeometryMetrics(translated);
    assert.equal(metrics.lowestEavesHeight, 2);
    assert.equal(metrics.height, 4);
    assert.equal(metrics.grossExternalWallAreaWithoutAttic, 8);
    assert.equal(metrics.grossExternalWallAreaAttic, 4);
  }
});

test("geometry/building-metrics: eaves height is null when ground or roof is missing", () => {
  const withoutGround = calculateBuildingGeometryMetrics(gableFaces);
  assert.equal(withoutGround.lowestEavesHeight, null);
  assert.equal(withoutGround.grossExternalWallAreaAttic, 4);

  const withoutRoof = calculateBuildingGeometryMetrics(faces.filter((face) => face.semanticType !== "RoofSurface"));
  assert.equal(withoutRoof.lowestEavesHeight, null);
});
