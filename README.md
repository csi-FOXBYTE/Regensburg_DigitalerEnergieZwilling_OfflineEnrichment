# Regensburg Digitaler Energiezwilling - Offline Enrichment

Offline enrichment tool for CityJSON files.

API documentation: [`docs/api/README.md`](docs/api/README.md)

The tool scans a folder for `*.json`, validates CityJSON structure, computes building geometry metrics, and writes the metrics back into each `Building` / `BuildingPart` under `attributes.digitalEnergyTwin`. An optional adjacency pass detects shared walls between neighbouring buildings across tile boundaries and adds the results to the same attribute block.

## Features

- Recursive JSON discovery with `tiny-glob`
- CityJSON structure guard before analysis
- Geometry metrics per building:
  - `volume`
  - `groundArea`
  - `upperFloorArea`
  - `grossExternalWallArea`
  - `roofArea`
  - `roofPitchDegrees`
  - `height`
  - `envelopeArea`
  - `roofWindowArea`
  - `externalWallWindowArea`
- CRS handling with `proj4` + `proj4-list`
  - accepts EPSG forms (`EPSG:25832`, `EPSG::25832`, OGC EPSG URL, numeric code)
  - accepts raw Proj4 strings (`+proj=...`)
  - decodes CityJSON `transform` before calculations
  - if source CRS is geographic, auto-selects UTM zone from dataset center
  - if source CRS is missing, assumes lon/lat and auto-projects to inferred UTM
- Optional adjacency pass (`--adjacency`):
  - indexes all `WallSurface` faces across all input files into a SpatiaLite database
  - uses an R\*Tree spatial index to find candidate wall face pairs within a configurable tolerance
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
| `municipalityKey` | `string` | Retain only CityObjects whose `Gemeindeschluessel` exactly matches this value. Objects without the attribute are excluded. |
| `ageZonesFile` | `string` | Enrich construction years from this GeoPackage. |
| `geothermalFile` | `string` | Enrich groundwater heat-pump availability from `potenzial_ong_gwwp` in this GeoPackage. |

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
      "roofArea": 0,
      "roofPitchDegrees": 0,
      "height": 0,
      "envelopeArea": 0,
      "roofWindowArea": 0,
      "externalWallWindowArea": 0,
      "geothermalEnergyAvailable": true,
      "adjacentBuildings": [
        { "buildingId": "DEBY_LOD2_12345", "sharedWallArea": 42.3 }
      ]
    }
  }
}
```

`adjacentBuildings` is only present when the adjacency pass is enabled.
`geothermalEnergyAvailable` is present when `geothermalFile` is set and the
building center matches a parcel. The `5-10_kW` and higher capacity categories
are available; lower, unavailable, and exclusion categories are not.

## Important Notes

- Input files are rewritten in place unless `--out` is specified.
- Non-CityJSON files are skipped.
- Files with geometry/CRS issues are skipped with a reason in the result.
- Coordinates are normalized before metric calculation.
- The adjacency pass tolerance (currently 0.5 m) is pending confirmation from the customer.

## Project Structure

- `src/analysis` — orchestration and file processing
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
