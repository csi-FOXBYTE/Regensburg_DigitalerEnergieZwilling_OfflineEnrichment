# Regensburg Digitaler Energiezwilling - Offline Enrichment

Offline enrichment tool for CityJSON files.

API documentation: [`docs/api/README.md`](docs/api/README.md)

Municipality adaptation guide: [`WHITELABELING.md`](WHITELABELING.md)

Software bill of materials: [`SBOM.cdx.json`](SBOM.cdx.json) · [`SBOM.csv`](SBOM.csv)

The tool scans a folder for `*.json`, validates CityJSON structure, computes building geometry metrics, and writes the metrics back into each `Building` / `BuildingPart` under `attributes.digitalEnergyTwin`. An optional adjacency pass detects shared walls between neighbouring buildings across tile boundaries and adds the results to the same attribute block.

## Features

- Recursive JSON discovery with `tiny-glob`
- CityJSON structure guard before analysis
- Geometry metrics per building:
  - `volume`
  - `groundArea`
  - `upperFloorArea`
  - `grossExternalWallArea`
  - `grossExternalWallAreaWithoutAttic`
  - `grossExternalWallAreaAttic`
  - `roofArea`
  - `roofPitchDegrees`
  - `height`
  - `lowestEavesHeight`
  - `envelopeArea`
  - `roofWindowArea`
  - `externalWallWindowArea`
- CRS handling with `proj4` + `proj4-list`
  - accepts EPSG forms (`EPSG:25832`, `EPSG::25832`, OGC EPSG URL, numeric code)
  - accepts raw Proj4 strings (`+proj=...`)
  - decodes CityJSON `transform` before calculations
  - transforms source coordinates into the projected CRS configured in `src/config/spatial.ts`
  - if source CRS is missing, assumes WGS84 lon/lat and projects to the configured CRS
- Optional adjacency pass (`--adjacency`):
  - indexes all `WallSurface` faces across all input files into a SpatiaLite database
  - uses an R\*Tree spatial index to find candidate wall face pairs within a configurable tolerance
  - requires outward normals to oppose within 1° and every vertex to lie within the configured tolerance of the other wall's plane
  - computes the actual shared wall area via symmetric 3D polygon intersection (Sutherland-Hodgman on the average projection plane)
  - handles cross-tile adjacencies — buildings near a tile edge are correctly matched against buildings in neighbouring tiles
- Output written in place or to a separate output directory (`--out`)

## Installation

```bash
pnpm install
```

Requires `libsqlite3-mod-spatialite` (Debian/Ubuntu) or `libspatialite` (Alpine) for the adjacency pass. The extension is loaded automatically; set `SPATIALITE_PATH` only if it lives outside the default search paths.

## Build

```bash
pnpm run build
```

## Test

Uses Node's internal test runner:

```bash
pnpm test
```

Docker end-to-end integration test (builds the image, runs container, and validates enriched output):

```bash
pnpm run test:e2e:docker
```

Notes:
- Requires Docker daemon access.
- Runs only when explicitly invoked to keep default test runs fast.

## Software bill of materials

Regenerate both checked-in SBOM formats with pnpm 11 or newer and the installed
dependency tree:

```bash
pnpm run sbom
```

The script uses pnpm's native CycloneDX 1.6 generator, adds the non-npm components
declared in `sbom.config.json`, validates the component and dependency references,
then writes `SBOM.cdx.json` and `SBOM.csv`. Keep that configuration synchronized
with the Dockerfile's base images and explicitly installed system packages.

The Docker publish workflow regenerates these files with Node.js 22.23.4 and
pnpm 11.3.0. On relevant pushes to `main`, it commits changed SBOM files. For a
tagged or manually dispatched image build, it saves the generated files as a
workflow artifact, embeds `SBOM.cdx.json` in the image, and produces a BuildKit
SBOM attestation for the final image. The image contains no audit receipt.
A full ScanCode/SPDX compliance audit must be run separately when preparing
an openCode publication; normal image builds do not run it.

## Usage (Library)

```ts
import { processCityJsonFiles } from "@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment";

const result = await processCityJsonFiles("./data", {
  sourceCrsFallback: "EPSG:25832",
  adjacency: true,
});

console.log(result.files);
```

### API

`processCityJsonFiles(srcDir: string, options?: ProcessCityJsonFilesOptions)`

Options:

| Option | Type | Description |
|---|---|---|
| `sourceCrsFallback` | `string` | Used when `metadata.referenceSystem` is missing. Supports EPSG and raw Proj4 strings. |
| `outDir` | `string` | Write enriched files here instead of overwriting the originals. |
| `adjacency` | `boolean` | Run the adjacency pass after indexing all buildings. |
| `addressOutput` | `string` | Write extracted building addresses to this SQLite file. |
| `municipalityKey` | `string` | Retain only CityObjects whose adapter-provided municipality key exactly matches this value. Objects without a key are excluded. |
| `ageZonesFile` | `string` | Enrich construction years from this GeoPackage. |
| `geothermalFile` | `string` | Enrich groundwater heat-pump availability from the configured GeoPackage layer. |

Return shape:

- `CityJsonAnalysisResult`
  - `files: CityJsonFileAnalysis[]`
  - each file has `status: "analyzed" | "skipped"`, optional `reason`, optional `buildings`

## Usage (CLI)

After build:

```bash
node dist/cli.mjs --src ./data --source-crs-fallback EPSG:25832
```

With adjacency pass and separate output directory:

```bash
node dist/cli.mjs --src ./data --out ./output --adjacency
```

Environment alternatives:

| Flag | Env var | Default |
|---|---|---|
| `--src` | `INPUT_DIR` | `/data` |
| `--out` | `OUTPUT_DIR` | *(in place)* |
| `--adjacency` | `ADJACENCY=1` | *(off)* |
| `--tolerance` | `TOLERANCE` | `0.15` |
| `--source-crs-fallback` | `SOURCE_CRS_FALLBACK` | *(none)* |
| `--address-output` | `ADDRESS_OUTPUT` | *(none)* |
| `--municipality-key` | `MUNICIPALITY_KEY` | *(none)* |
| `--age-zones` | `AGE_ZONES_FILE` | *(none)* |
| `--geothermal` | `GEOTHERMAL_FILE` | *(none)* |
| *(SpatiaLite path)* | `SPATIALITE_PATH` | *(auto-detected)* |

Example with environment variables:

```bash
INPUT_DIR=./data OUTPUT_DIR=./output ADJACENCY=1 node dist/cli.mjs
```

To restrict local CLI processing to the city of Regensburg, set
`MUNICIPALITY_KEY=09362000` or pass `--municipality-key 09362000`. The same
setting can be passed to the Docker container with `-e MUNICIPALITY_KEY=09362000`.

## Docker

Build image:

```bash
docker build -t det-offline-enrichment .
```

Run with mounted input folder:

```bash
docker run --rm \
  -v "$(pwd)/data:/data" \
  det-offline-enrichment
```

With adjacency pass and separate output:

```bash
docker run --rm \
  -v "$(pwd)/data/cityjson:/data/cityjson" \
  -v "$(pwd)/data/output:/data/output" \
  -e ADJACENCY=1 \
  det-offline-enrichment \
  node dist/cli.mjs --src /data/cityjson --out /data/output --adjacency
```

## Output Enrichment Format

For each analyzed building object:

```json
{
  "attributes": {
    "digitalEnergyTwin": {
      "volume": 0,
      "groundArea": 0,
      "upperFloorArea": 0,
      "grossExternalWallArea": 0,
      "grossExternalWallAreaWithoutAttic": 0,
      "grossExternalWallAreaAttic": 0,
      "roofArea": 0,
      "roofPitchDegrees": 0,
      "height": 0,
      "lowestEavesHeight": 0,
      "envelopeArea": 0,
      "roofWindowArea": 0,
      "externalWallWindowArea": 0,
      "geothermalEnergyAvailable": true,
      "adjacentBuildings": "[{\"buildingId\":\"DEBY_LOD2_12345\",\"sharedWallArea\":42.3,\"sharedWallAreaWithoutAttic\":35,\"sharedWallAreaAttic\":7.3}]"
    }
  }
}
```

`adjacentBuildings` is written when the adjacency pass is enabled. It remains a
JSON-encoded string; parse it to obtain the adjacency array. Buildings with no
detected neighbours receive `"[]"`, replacing any previous adjacency data.

`grossExternalWallArea` remains the full gross wall area. Its two components,
`grossExternalWallAreaWithoutAttic` and `grossExternalWallAreaAttic`, split the
wall polygons horizontally at the lowest elevation of the largest connected
roof island. Roof faces connect through shared 3D boundary segments within
1 cm, including partially shared or subdivided edges. Point-only contact and
connections through walls do not join islands. The largest island is selected
by its combined surface area after subtracting polygon holes; equal-area
islands are ordered by their lowest elevation. No percentage threshold is used.
The global `NiedrigsteTraufeDesGebaeudes` attribute does not set this split,
because it may refer to a separate low canopy. If no usable roof faces are
available, both split values are `null`.

`lowestEavesHeight` exports this selected roof island's lowest elevation **relative
to the building's lowest ground elevation**, in metres. It equals the absolute
wall split elevation minus the minimum `GroundSurface` vertex elevation, using
the same ground reference as `height`. It is `null` if either a usable roof
island or ground elevation is unavailable. The wall split itself continues to
use the absolute elevation internally.

The area without attic includes the portion at or below the cut; attic area is
the remainder above it. The two values sum to the unchanged gross wall area.
Eaves at or above the highest wall vertex give exactly zero attic wall area,
including flat-roof buildings. Both values include shared walls and window/door
areas unless openings are explicitly represented as polygon holes.

Each adjacency retains `sharedWallArea` for the complete overlap and adds
`sharedWallAreaWithoutAttic` and `sharedWallAreaAttic`. The overlap geometry is
split at the **current building's** absolute eave elevation using the same roof
island selection as the gross areas. For neighbours A and B, the total shared
area is symmetric, but their split portions can differ because their eaves can
be at different elevations. Both portions are `null` if the current building
has no usable roof; a missing roof on its neighbour does not prevent its own
split. Ground elevation is not required for this absolute cut.

Known shared portions sum to `sharedWallArea`. Gross and shared areas use the
same positive-area, near-vertical wall selection and account for polygon holes.
Concave walls and disconnected overlap portions are supported. Shared areas
retain the common-plane projection used by the adjacency calculation.

The exposed wall area below the eaves is:

```text
grossExternalWallAreaWithoutAttic
  - sum(adjacentBuildings[*].sharedWallAreaWithoutAttic)
```

Use the corresponding `Attic` fields for exposed wall above the eaves. Preserve
an unknown result when a required value is `null` or missing; do not substitute
the full shared area or treat missing split data as zero. An empty array from
a completed adjacency pass has a shared sum of zero. Existing enriched files
must be reprocessed with adjacency enabled to obtain the new split fields.

`geothermalEnergyAvailable` is present when `geothermalFile` is set and the
building center matches a parcel. The category mapping and availability
threshold are configured in `src/config/geothermal.ts` and its importer.

## Whitelabeling

Municipality-specific building selection, coordinate-system, GeoPackage schema,
and source-property assumptions are centralized under `src/config`. See
[`WHITELABELING.md`](WHITELABELING.md) for the repository and cross-frontend
adaptation checklist.

## Important Notes

- Input files are rewritten in place unless `--out` is specified.
- Non-CityJSON files are skipped.
- Files with geometry/CRS issues are skipped with a reason in the result.
- Coordinates are normalized to the configured analysis CRS before metric calculation.
- The adjacency pass tolerance defaults to 0.15 m.

## Project Structure

- `src/analysis` — orchestration and file processing
- `src/config` — municipality and dataset configuration plus source adapters
- `src/db` — SpatiaLite spatial database for adjacency indexing
- `src/discovery` — input file discovery
- `src/geometry` — coordinate normalization and geometry math
- `src/shared` — shared types/guards
- `src/validation` — CityJSON validation
- `test` — unit tests + integration tests

## License

This project is licensed under the GNU Lesser General Public License,
version 3 or (at your option) any later version (`LGPL-3.0-or-later`).
See `LICENSE`, `COPYING.LESSER`, and `COPYING`.
