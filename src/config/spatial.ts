export const spatialConfig = {
  /** Projected CRS used for metric analysis, address coordinates, and spatial joins. */
  analysisCrs: "EPSG:25832",
  /** Numeric SRID matching `analysisCrs`, used by SpatiaLite and GeoPackage checks. */
  srid: 25832,
  /** Human-readable CRS name used in validation errors and documentation. */
  displayName: "ETRS89 / UTM zone 32N",
} as const;
