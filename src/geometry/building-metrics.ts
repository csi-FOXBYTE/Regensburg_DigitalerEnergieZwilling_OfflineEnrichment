import type { BuildingGeometryMetrics, PolygonFace } from "../shared/types.js";
import { polygonArea, polygonNormal, polygonSignedVolumeContribution } from "./polygon-math.js";

/**
 * Computes building metrics from a set of polygonal faces.
 *
 * @group Geometry
 * @param faces Extracted faces of a building.
 * @returns Aggregated geometric metrics.
 */
export function calculateBuildingGeometryMetrics(faces: PolygonFace[]): BuildingGeometryMetrics {
  let signedVolume = 0;
  let groundArea = 0;
  let wallArea = 0;
  let roofArea = 0;
  let roofPitchWeighted = 0;
  let roofPitchArea = 0;

  let minGroundZ = Number.POSITIVE_INFINITY;
  let maxRoofZ = Number.NEGATIVE_INFINITY;

  for (const face of faces) {
    const area = polygonArea(face.rings);
    if (area <= 0) {
      continue;
    }

    signedVolume += polygonSignedVolumeContribution(face.rings);

    if (face.semanticType === "GroundSurface") {
      groundArea += area;

      for (const ring of face.rings) {
        for (const vertex of ring) {
          minGroundZ = Math.min(minGroundZ, vertex[2]);
        }
      }
    }

    if (face.semanticType === "RoofSurface") {
      roofArea += area;

      const normal = polygonNormal(face.rings[0]!);
      if (normal) {
        const slopeRadians = Math.atan2(
          Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]),
          Math.abs(normal[2]),
        );
        roofPitchWeighted += (slopeRadians * 180) / Math.PI * area;
        roofPitchArea += area;
      }

      for (const ring of face.rings) {
        for (const vertex of ring) {
          maxRoofZ = Math.max(maxRoofZ, vertex[2]);
        }
      }
    }

    if (face.semanticType === "WallSurface") {
      const normal = polygonNormal(face.rings[0]!);

      if (!normal || Math.abs(normal[2]) <= 0.2) {
        wallArea += area;
      }
    }
  }

  const volume = Math.abs(signedVolume);
  const upperFloorArea = groundArea;
  const roofPitchDegrees = roofPitchArea > 0 ? roofPitchWeighted / roofPitchArea : null;
  const height = Number.isFinite(minGroundZ) && Number.isFinite(maxRoofZ) ? maxRoofZ - minGroundZ : null;
  const envelopeArea = groundArea + wallArea + roofArea;

  return {
    volume,
    groundArea,
    upperFloorArea,
    grossExternalWallArea: wallArea,
    roofArea,
    roofPitchDegrees,
    height,
    envelopeArea,
  };
}
