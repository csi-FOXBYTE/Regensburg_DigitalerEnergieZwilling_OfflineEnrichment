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
