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
  assert.equal(metrics.envelopeArea, 10);
  assert.equal(metrics.height, 2);
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
