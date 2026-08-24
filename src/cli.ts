import { processCityJsonFiles } from "./index.js";

/**
 * CLI options for processing CityJSON files.
 *
 * @group CLI
 */
interface CliOptions {
  /** Source directory containing JSON files to process. */
  srcDir: string;
  /** Output directory; writes in place when omitted. */
  outDir?: string | undefined;
  /** Whether to run the adjacency pass. */
  adjacency: boolean;
  /** Maximum distance in metres between wall faces to count as adjacent. */
  adjacencyTolerance: number;
  /** Optional fallback for missing CRS information in the input. */
  sourceCrsFallback?: string | undefined;
  /** When set, writes building addresses to a SQLite file at this path. */
  addressOutput?: string | undefined;
  /** Retain only CityObjects whose Gemeindeschluessel exactly matches this value. */
  municipalityKey?: string | undefined;
  /** When set, enriches buildings with construction year from the given GeoPackage. */
  ageZonesFile?: string | undefined;
  /** When set, enriches buildings with groundwater heat-pump availability. */
  geothermalFile?: string | undefined;
}

/**
 * Reads the value of a command-line flag.
 *
 * @group CLI
 * @param flag CLI flag, for example `--src`.
 * @returns Following argument value, or `undefined` if not present.
 */
function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    return undefined;
  }

  return value;
}

/**
 * Parses CLI options from arguments and environment variables.
 *
 * @group CLI
 * @returns Normalized CLI configuration.
 */
function parseCliOptions(): CliOptions {
  const srcDir = readArg("--src") ?? process.env.INPUT_DIR ?? "/data";
  const outDir = readArg("--out") ?? process.env.OUTPUT_DIR;
  const adjacency = process.argv.includes("--adjacency") || process.env.ADJACENCY === "1";
  const adjacencyTolerance = parseFloat(readArg("--tolerance") ?? process.env.TOLERANCE ?? "0.15");
  const sourceCrsFallback =
    readArg("--source-crs-fallback") ?? process.env.SOURCE_CRS_FALLBACK;
  const addressOutput = readArg("--address-output") ?? process.env.ADDRESS_OUTPUT;
  const municipalityKey = readArg("--municipality-key") ?? process.env.MUNICIPALITY_KEY;
  const ageZonesFile = readArg("--age-zones") ?? process.env.AGE_ZONES_FILE;
  const geothermalFile = readArg("--geothermal") ?? process.env.GEOTHERMAL_FILE;

  return {
    srcDir,
    outDir,
    adjacency,
    adjacencyTolerance,
    sourceCrsFallback,
    addressOutput,
    municipalityKey,
    ageZonesFile,
    geothermalFile,
  };
}

/**
 * Prints CLI usage help to stdout.
 *
 * @group CLI
 */
function printUsage(): void {
  console.log(`Usage:
  node dist/cli.mjs --src /data [--out /data/output] [--adjacency] [--tolerance 0.15] [--source-crs-fallback EPSG:25832] [--address-output /data/addresses.sqlite] [--municipality-key 09362000] [--age-zones /data/Baualtersklassen.gpkg] [--geothermal /data/geothermal.gpkg]

Environment alternatives:
  INPUT_DIR=/data
  OUTPUT_DIR=/data/output
  ADJACENCY=1
  TOLERANCE=0.15
  SOURCE_CRS_FALLBACK=EPSG:25832
  ADDRESS_OUTPUT=/data/addresses.sqlite
  MUNICIPALITY_KEY=09362000
  AGE_ZONES_FILE=/data/Baualtersklassen.gpkg
  GEOTHERMAL_FILE=/data/geothermal.gpkg`);
}

/**
 * Entry point for CLI processing.
 *
 * @group CLI
 */
async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseCliOptions();
  const result = await processCityJsonFiles(options.srcDir, {
    outDir: options.outDir,
    adjacency: options.adjacency,
    adjacencyTolerance: options.adjacencyTolerance,
    sourceCrsFallback: options.sourceCrsFallback,
    addressOutput: options.addressOutput,
    municipalityKey: options.municipalityKey,
    ageZonesFile: options.ageZonesFile,
    geothermalFile: options.geothermalFile,
  });

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Runs the CLI and maps failures to a stable exit code.
 *
 * @group CLI
 */
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(message);
  process.exitCode = 1;
});
