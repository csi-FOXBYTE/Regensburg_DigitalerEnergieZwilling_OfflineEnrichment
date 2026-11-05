# Regensburg Digitaler Energiezwilling - Offline Enrichment

Offline enrichment tool for CityJSON files.

API documentation: [`docs/api/README.md`](docs/api/README.md)

Municipality adaptation guide: [`WHITELABELING.md`](WHITELABELING.md)

Software bill of materials: [`SBOM.cdx.json`](SBOM.cdx.json) · [`SBOM.csv`](SBOM.csv)

The tool scans a folder for `*.json`, validates CityJSON structure, computes building geometry metrics, and writes the metrics back into each `Building` / `BuildingPart` under `attributes.digitalEnergyTwin`. An optional adjacency pass detects shared walls between neighbouring buildings across tile boundaries and adds the results to the same attribute block.

## Features

- Recursive JSON discovery with `tiny-glob`
- CityJSON structure and content validation with per-file size and complexity limits before analysis
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
  - skips wall pairs and convex polygon pieces whose projected bounding boxes are disjoint before clipping
  - skips files whose candidate wall pairs exceed the adjacency limits (see [Input limits and validation](#input-limits-and-validation))
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

To publish a release, first update and commit the version in `package.json` on
`main`. Then run the Docker publish workflow manually from `main` and check the
confirmation box stating that it will use the committed package version. The
workflow stops if that version already has a tag. It regenerates both SBOMs with
Node.js 22.23.4 and pnpm 11.3.0, saves them as a workflow artifact, commits them
to `main`, and tags that release commit with the package version. It builds the
image from that exact commit, embeds the runtime part of `SBOM.cdx.json` (the
npm packages installed in the image plus the base image and system packages,
derived by `scripts/runtime-sbom.mjs`) at `/usr/share/regensburg/SBOM.cdx.json`,
and produces a BuildKit SBOM attestation. Tag pushes and other commits do not start the workflow. The image
does not include an audit receipt.
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
| `limits` | `Partial<ProcessingLimits>` | Override the per-file processing limits (see [Input limits and validation](#input-limits-and-validation)). |

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
| `--strict` | `STRICT=1` | *(off)* |
| `--max-file-bytes` | `MAX_FILE_BYTES` | `134217728` (128 MiB) |
| `--max-nesting-depth` | `MAX_NESTING_DEPTH` | `32` |
| `--max-city-objects` | `MAX_CITY_OBJECTS` | `100000` |
| `--max-vertices` | `MAX_VERTICES` | `2000000` |
| `--max-ring-vertices` | `MAX_RING_VERTICES` | `2000` |
| `--max-adjacency-pairs` | `MAX_ADJACENCY_PAIRS` | `1000000` |
| `--max-adjacency-vertex-products` | `MAX_ADJACENCY_VERTEX_PRODUCTS` | `20000000` |
| *(SpatiaLite path)* | `SPATIALITE_PATH` | *(auto-detected)* |

Empty or blank values for the optional settings (`OUTPUT_DIR`,
`SOURCE_CRS_FALLBACK`, `ADDRESS_OUTPUT`, `AGE_ZONES_FILE`, `GEOTHERMAL_FILE`
and the limits) count as unset, so an orchestrator may render an unused
optional setting as `""`. `MUNICIPALITY_KEY` is the exception: an empty key
still filters out every CityObject instead of disabling the restriction.

The CLI exits non-zero when no input file is found, when no file could be
processed, when a setting is invalid, or when two input files map to the same
output path. With `STRICT=1` (or `--strict`) it also exits non-zero as soon as
any file is skipped; use this in pipelines so a partially processed batch is
not reported as success.

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

The image runs as the non-root user `node` (uid/gid 1000). The mounted folders
must be writable by that user, or pass a matching `--user "$(id -u):$(id -g)"`.
It contains only the production dependencies and `node`; the base image's
package managers (npm, npx, corepack, yarn) are removed.

With adjacency pass and separate output:

```bash
docker run --rm \
  -v "$(pwd)/data/cityjson:/data/cityjson" \
  -v "$(pwd)/data/output:/data/output" \
  -e ADJACENCY=1 \
  det-offline-enrichment \
  node dist/cli.mjs --src /data/cityjson --out /data/output --adjacency
```

## Input limits and validation

Input files are untrusted. Before deep processing, each file is checked
against the following limits; a file that exceeds one is skipped with a reason
in the result (and fails the run in strict mode):

| Limit | Default | Checked |
|---|---|---|
| File size (`maxFileBytes`) | 128 MiB | before the file is read |
| JSON nesting depth (`maxNestingDepth`) | 32 | on the raw text, before parsing |
| CityObjects per file (`maxCityObjects`) | 100,000 | after parsing |
| Vertices per file (`maxVertices`) | 2,000,000 | after parsing |
| Vertices per polygon ring (`maxRingVertices`) | 2,000 | after parsing |
| Candidate wall pairs per file (`maxAdjacencyPairs`) | 1,000,000 | while indexing for the adjacency pass |
| Summed vertex-count products of these pairs (`maxAdjacencyVertexProducts`) | 20,000,000 | while indexing for the adjacency pass |

The defaults leave at least five times headroom over the largest Regensburg
LoD2 tile measured (25 MB, 5,578 CityObjects, 132,947 vertices, 395 vertices
per ring, nesting depth 10, 142,905 candidate wall pairs with 2,922,052 summed
vertex-count products).

The adjacency pass compares nearby walls pairwise, so co-located geometry
(e.g. thousands of stacked buildings) makes it quadratic, and the overlap
clipping of one pair costs up to the product of both walls' vertex counts.
The two adjacency limits apply only with `--adjacency`: while a file is
indexed, its candidate wall pairs are counted before any pair is compared. A
candidate pair is a pair of walls whose bounding boxes lie within the tolerance
of each other and of which at least one belongs to the file, including pairs
with walls of files indexed before it. A file over either limit is removed from
the index again and skipped. Peak memory still grows with file size, so run
the tool with a memory limit, and bound the total runtime externally.

A file is also skipped when its `version` is not CityJSON 2.0 (`2.0` or
`2.0.x`), when a vertex coordinate or a `transform` value is not a finite
number, when `transform.scale` contains zero, when a geometry uses a vertex
index that is not an integer inside the vertex array, or when decoding and
projecting its coordinates produces non-finite values.

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
- With `--out`, each file keeps its path relative to the input directory
  (`<src>/a/tile.json` is written to `<out>/a/tile.json`). If two input files
  would still map to the same output path, compared case-insensitively, the
  run fails before writing anything. When the output directory lies inside
  the input directory, files in it are not read as input.
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
