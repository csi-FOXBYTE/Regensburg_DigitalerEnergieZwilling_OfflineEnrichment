# Regensburg Digitaler Energiezwilling - Offline Enrichment

Offline enrichment tool for CityJSON files.

API documentation: [`docs/api/README.md`](docs/api/README.md)

The tool scans a folder for `*.json`, validates CityJSON structure, computes building geometry metrics, and writes the metrics back into each `Building` / `BuildingPart` under:

- `attributes.digitalEnergyTwin`

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
- CRS handling with `proj4` + `proj4-list`
  - accepts EPSG forms (`EPSG:25832`, `EPSG::25832`, OGC EPSG URL, numeric code)
  - accepts raw Proj4 strings (`+proj=...`)
  - decodes CityJSON `transform` before calculations
  - if source CRS is geographic, auto-selects UTM zone from dataset center
  - if source CRS is missing, assumes lon/lat and auto-projects to inferred UTM
- In-place JSON rewrite after enrichment

## Installation

```bash
pnpm install
```

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
});

console.log(result.files);
```

### API

`processCityJsonFiles(srcDir: string, options?: ProcessCityJsonFilesOptions)`

Options:

- `sourceCrsFallback?: string`
  - Used when `metadata.referenceSystem` is missing.
  - Supports EPSG and raw Proj4 strings.

Return shape:

- `CityJsonAnalysisResult`
  - `files: CityJsonFileAnalysis[]`
  - each file has `status: "analyzed" | "skipped"`, optional `reason`, optional `buildings`

## Usage (CLI)

After build:

```bash
node dist/cli.mjs --src ./data --source-crs-fallback EPSG:25832
```

Environment alternatives:

- `INPUT_DIR` (default: `/data`)
- `SOURCE_CRS_FALLBACK`

Example:

```bash
INPUT_DIR=./data SOURCE_CRS_FALLBACK=EPSG:25832 node dist/cli.mjs
```

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

With CRS fallback:

```bash
docker run --rm \
  -v "$(pwd)/data:/data" \
  -e SOURCE_CRS_FALLBACK="EPSG:25832" \
  det-offline-enrichment
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
      "envelopeArea": 0
    }
  }
}
```

## Important Notes

- Input files are rewritten in place.
- Non-CityJSON files are skipped.
- Files with geometry/CRS issues are skipped with a reason in the result.
- Coordinates are normalized before metric calculation.

## Project Structure

- `src/analysis` - orchestration and file processing
- `src/discovery` - input file discovery
- `src/geometry` - coordinate normalization and geometry math
- `src/shared` - shared types/guards
- `src/validation` - CityJSON validation
- `test` - domain unit tests + integration test

## License

MIT
