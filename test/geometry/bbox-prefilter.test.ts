import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { openSpatialDatabase } from "../../src/db/spatial-database.js";
import { normalizeVerticesForGeometry } from "../../src/geometry/coordinate-normalization.js";
import { extractFacesFromGeometry } from "../../src/geometry/face-extractor.js";
import { wallFaceIntersectionAreas } from "../../src/geometry/polygon-math.js";
import { wallSplitHeight } from "../../src/geometry/roof-islands.js";
import type { Vertex } from "../../src/shared/types.js";
import { isCityJsonLike } from "../../src/validation/cityjson.js";

const FIXTURES = ["720_5432.json", "720_5434.json", "t-shaped-bricks.json"];

type Intersect = typeof wallFaceIntersectionAreas;

/** Runs the full adjacency pass over all fixtures with the given intersection function. */
function adjacenciesFor(intersect: Intersect): Map<string, unknown> {
  const db = openSpatialDatabase(intersect);
  const ids: string[] = [];
  try {
    for (const name of FIXTURES) {
      const parsed: unknown = JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
      assert.ok(isCityJsonLike(parsed));
      const vertices = normalizeVerticesForGeometry(parsed, { sourceCrsFallback: "EPSG:25832" });
      for (const [id, cityObject] of Object.entries(parsed.CityObjects)) {
        const faces = (cityObject.geometry ?? []).flatMap((geometry) => extractFacesFromGeometry(geometry, vertices));
        db.addBuilding(id, name, cityObject.type, wallSplitHeight(faces));
        for (const face of faces) {
          if (face.semanticType === "WallSurface") db.addWallSurface(id, face);
        }
        ids.push(id);
      }
    }
    db.computeAdjacencies(0.15);
    return new Map(ids.map((id) => [id, db.getAdjacencies(id)]));
  } finally {
    db.close();
  }
}

test("bbox prefilter: adjacency results on the fixtures are identical with and without it", () => {
  let calls = 0;
  const withPrefilter: Intersect = (...args) => {
    calls += 1;
    return wallFaceIntersectionAreas(args[0], args[1], args[2], args[3], args[4], { bboxPrefilter: true });
  };
  const withoutPrefilter: Intersect = (...args) =>
    wallFaceIntersectionAreas(args[0], args[1], args[2], args[3], args[4], { bboxPrefilter: false });

  const expected = adjacenciesFor(withoutPrefilter);
  const actual = adjacenciesFor(withPrefilter);

  assert.ok(calls > 1000, `expected many candidate wall pairs, got ${calls}`);
  assert.ok([...expected.values()].some((list) => (list as unknown[]).length > 0), "expected some adjacencies");
  assert.deepEqual(actual, expected);
});

test("bbox prefilter: concave and offset wall pairs give identical results", () => {
  // U-shaped wall in the plane y=0 (outward normal -y) and opposing walls in y=0.05 (normal +y).
  const uShape: Vertex[] = [[0, 0, 0], [0, 0, 6], [2, 0, 6], [2, 0, 2], [4, 0, 2], [4, 0, 6], [6, 0, 6], [6, 0, 0]];
  const opposing = (x0: number, x1: number, z0: number, z1: number): Vertex[] =>
    [[x0, 0.05, z0], [x1, 0.05, z0], [x1, 0.05, z1], [x0, 0.05, z1]];
  const zigzag: Vertex[] = [[0, 0.05, 0], [6, 0.05, 0], [6, 0.05, 5], [5, 0.05, 1], [4, 0.05, 5], [3, 0.05, 1],
    [2, 0.05, 5], [1, 0.05, 1], [0, 0.05, 5]];

  const cases: [Vertex[][], Vertex[][]][] = [
    [[uShape], [opposing(0, 6, 0, 6)]],
    [[uShape], [opposing(2.5, 3.5, 3, 5)]], // inside the notch: no overlap
    [[uShape], [opposing(20, 21, 0, 1)]], // far away along the wall
    [[uShape], [zigzag]],
    [[uShape, [[0.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1.5], [0.5, 0, 1.5]]], [zigzag]],
    // The hole's piece lies left of the opposing wall and is skipped by the piece-level check.
    [[uShape, [[0.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1.5], [0.5, 0, 1.5]]], [opposing(4.2, 5.8, 0.2, 5)]],
  ];
  let overlapping = 0;
  for (const [a, b] of cases) {
    for (const split of [null, 1.5, 4] as const) {
      const off = wallFaceIntersectionAreas(a, b, 0.15, split, split, { bboxPrefilter: false });
      const on = wallFaceIntersectionAreas(a, b, 0.15, split, split, { bboxPrefilter: true });
      assert.deepEqual(on, off);
      if (off.area > 0) overlapping += 1;
    }
  }
  assert.ok(overlapping >= 9, `expected overlapping cases, got ${overlapping}`);
});
