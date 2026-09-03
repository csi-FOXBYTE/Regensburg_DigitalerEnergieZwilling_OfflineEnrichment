# Whitelabeling the offline enrichment tool

This guide describes the repository-local changes required to prepare CityJSON
and enrichment data for another municipality. Work through the sections in
order. Later steps assume that the input schema, coordinate system, enrichment
sources, and frontend contract have already been aligned.

## 1. Update the repository identity

Review the municipality name and repository coordinates in:

- `README.md`, including its title and package import example;
- `package.json`, especially `name`, `description`, and package metadata;
- `Dockerfile`, especially `org.opencontainers.image.source`;
- `NOTICE` and any distribution-specific attribution;
- CI, registry, and deployment configuration maintained outside this repository.

Do not rename the npm package or container source label unless the corresponding
package and repository really exist under the new name. Update downstream imports
and deployment references together when either identifier changes.

## 2. Configure the analysis coordinate system

Edit `src/config/spatial.ts`:

- `analysisCrs` is the projected CRS used for metric calculations, address
  coordinates, adjacency indexing, and polygon joins.
- `srid` is the numeric SpatiaLite and GeoPackage identifier for the same CRS.
- `displayName` is its human-readable name in validation errors.

`analysisCrs` and `srid` must describe the same projected, metre-based coordinate
system. The current values are `EPSG:25832`, SRID `25832`, and
`ETRS89 / UTM zone 32N`.

CityJSON vertices are decoded and transformed into `analysisCrs`. The source CRS
comes from `metadata.referenceSystem`, with `sourceCrsFallback`/
`--source-crs-fallback` used only when that metadata is absent. If neither is
provided, the input is treated as WGS84 longitude/latitude (`EPSG:4326`) before
being projected. Set an explicit fallback when input without metadata is already
projected.

Both optional GeoPackages must use the configured `srid`; the importers reject a
different or missing SRID. Reproject source data before running the tool rather
than changing its GeoPackage metadata without transforming the geometries.

After changing the CRS, update coordinate fixtures and verify a known building
near each edge of the municipality. Confirm that calculated areas are in square
metres and that the generated address coordinates agree with the frontend.

## 3. Configure selectable buildings

Edit `src/config/building.ts` and set `selectableFunctionPrefix` to the
municipality's accepted CityJSON building-function prefix. The value is written
to `building_addresses.is_valid_building` and must match
`selectableBuildingFunctionPrefix` in the frontend's `src/config/map.ts`.

If eligibility cannot be expressed as a prefix, change the derivation in
`src/config/adapters/buildingFeature.ts` while preserving the adapter's boolean
`isValidBuilding` output.

## 4. Adapt the CityJSON source schema

`src/config/adapters/buildingFeature.ts` is the boundary between the source
CityJSON properties and the stable processing model. Update it when the new
municipality's CityJSON differs:

- `functionProperty` reads the value used by the selectable-building rule.
- `addressProperty` locates the address collection and thoroughfare value.
- `parseThoroughfare` splits a source string into street/house-number records.
- `adaptMunicipalityKey` reads the value compared with `municipalityKey`.

The current source uses `attributes.function`, an `address` array with
`ThoroughfareName`, and `attributes.Gemeindeschluessel`. Missing or malformed
values deliberately produce no addresses, a non-selectable building, or no
municipality match.

Keep parsing and source-field knowledge in this adapter. Static policy values,
such as the accepted building-function prefix and coordinate system, belong in
the top-level config files instead.

Address parsing must produce one row per street and house-number combination.
The building ID is taken from the CityJSON `CityObjects` key; it must be the same
ID later exposed by the generated 3D Tiles metadata so frontend address search
can select the correct feature.

## 5. Configure municipality filtering

The municipality value itself is a runtime setting:

- library: `ProcessCityJsonFilesOptions.municipalityKey`;
- CLI: `--municipality-key`;
- environment: `MUNICIPALITY_KEY`.

The filter is strict. When enabled, it removes every CityObject whose
adapter-provided municipality key is absent or different, then cleans dangling
parent/child relationships. Set the production value to the new municipality's
official key and update deployment configuration. Leaving the option unset does
not filter the input.

If the source stores municipality membership differently, change
`adaptMunicipalityKey`; do not add source-field checks to the filter itself.

## 6. Configure construction-age zones

Edit `src/config/ageZones.ts`:

- `layerName` selects the GeoPackage feature table.
- `classificationColumn` contains the source age-band label.
- `geometryColumn` contains the polygon geometry.

The current importer derives `constructionYear` from a four-digit year at the
start of the classification value, for example `1949-1957` becomes `1949`.
Update `parseLowerYear` in `src/db/age-zones-importer.ts` if the new source uses
a different representation or if a different representative year is required.
That choice affects the frontend's building-age band and energy calculation, so
confirm it with the data owner rather than assuming that the lower bound is
appropriate.

The configured table must be registered in `gpkg_geometry_columns` and use the
SRID from `src/config/spatial.ts`.

## 7. Configure geothermal zones

Edit `src/config/geothermal.ts`:

- `layerName` selects the GeoPackage feature table.
- `categoryColumn` contains the capacity category.
- `geometryColumn` contains the parcel geometry.
- `minimumAvailableCapacityKw` is the minimum lower bound considered available.

The current mapping in `src/db/geothermal-zones-importer.ts` accepts categories
shaped like `5-10_kW`. Other strings, including exclusion reasons and `<5_kW`,
map to unavailable. Change `isGeothermalEnergyAvailableCategory` if another
source uses booleans, numeric capacities, localized labels, or a different
category syntax.

The output is a boolean named `geothermalEnergyAvailable`; verify that the new
dataset and product requirements still support that simplification.

## 8. Keep the address database compatible

The address database schema is defined in `src/db/address-database.ts`. The
frontend currently expects:

- `streets(id, name)`;
- `building_addresses(building_id, street_id, house_number, cx, cy,
  is_valid_building)`;
- `cx` and `cy` in the configured analysis CRS;
- building IDs matching the 3D Tiles features.

When the CRS changes, update the frontend's `src/config/addressDb.ts` coordinate
transform as part of the same whitelabel. When the schema changes, update the
frontend queries under `src/lib/addressDb/` at the same time.

Generate a new database rather than reusing one created with an old schema,
coordinate system, selection rule, or source adapter. Test duplicate street
names, multi-address buildings, house-number suffixes, and buildings without an
address.

## 9. Preserve the enrichment output contract

Geometry, adjacency, construction-year, and geothermal results are written
under `attributes.digitalEnergyTwin`. The frontend's
`src/config/adapters/buildingFeature.ts` consumes these fields after CityJSON is
converted to 3D Tiles.

Before renaming the attribute block or any nested field, update and release all
downstream converters and frontend adapters. Pay particular attention to
`adjacentBuildings`: it is stored as a JSON string because of the downstream
metadata conversion path.

The semantic surface labels `GroundSurface`, `WallSurface`, and `RoofSurface`
come from CityJSON. If the input uses another geometry or semantics model,
adapt `src/geometry/face-extractor.ts` and add representative fixtures; this is
more than a municipality configuration change.

## 10. Review operational defaults and source files

Review CLI flags, environment variables, and deployment mounts described in
`README.md`, especially:

- `SOURCE_CRS_FALLBACK`;
- `MUNICIPALITY_KEY`;
- `AGE_ZONES_FILE`;
- `GEOTHERMAL_FILE`;
- `ADDRESS_OUTPUT`;
- adjacency tolerance and output paths.

The age and geothermal paths select files at runtime; the config files select
the layers and meanings inside those files. Ensure the production image can load
SpatiaLite and that `SPATIALITE_PATH` matches the image distribution.

Review data licensing and attribution separately. CityJSON and GeoPackage input
data are not included in the npm package merely because the tool can process
them, but deployments and redistributed datasets may still have attribution or
license obligations.

## 11. Update tests and documentation

Update the focused fixtures whenever their assumptions change:

- `test/config/building-feature-adapter.test.ts` for source property names,
  address parsing, municipality extraction, and the building selection rule;
- `test/geometry/coordinate-normalization.test.ts` for the configured CRS and
  known reference points;
- `test/analysis/municipality-filter.test.ts` for the municipality source value;
- `test/analysis/age-enrichment.test.ts` for age-zone coverage and year mapping;
- `test/db/geothermal-zones-importer.test.ts` and
  `test/analysis/geothermal-enrichment.test.ts` for category and parcel mapping;
- address, integration, and Docker tests for the full generated contracts.

Regenerate the TypeDoc output with `pnpm run docs` when exported API comments or
types change. Update `README.md` examples and defaults even when tests do not
assert their literal values.

## 12. Regenerate the SBOM

Regenerate `SBOM.cdx.json` and `SBOM.csv` after dependency, base-image, package,
or version changes. The CycloneDX document should describe this repository as
the root component, distinguish runtime and development dependencies, and list
the Docker base image plus referenced system software that is not represented by
the npm lockfile. Keep unresolved licenses explicit instead of guessing them.

## 13. Verify the whitelabel

Before release:

1. Search for the old municipality name, municipality keys, regional source
   names, layer and column names, EPSG/SRID values, repository URLs, and package
   coordinates. Classify every remaining match as intentional or replace it.
2. Run lint, unit/integration tests, build, and the explicit Docker end-to-end
   test in the project's development environment.
3. Process representative CityJSON from the new municipality with every optional
   enrichment enabled. Inspect skipped-file reasons and spot-check geometry
   metrics against a trusted GIS tool.
4. Inspect the generated address database and enriched CityJSON. Confirm IDs,
   coordinates, municipality filtering, selectable-building flags, construction
   years, geothermal booleans, and adjacency data.
5. Convert the enriched data to 3D Tiles and test it with the whitelabeled
   frontend. Verify address search, building selection, displayed geometry
   values, construction age, geothermal availability, and shared-wall handling.
6. Validate both SBOM formats and review all `NOASSERTION` or not-pinned entries.

A whitelabel is complete only when the input adapters, static configuration,
runtime deployment values, generated data, frontend expectations, documentation,
tests, and software inventory all agree.
