import { evaluateRunResult } from "./cli-report.js";
import { spatialConfig } from "./config/spatial.js";
import { processCityJsonFiles } from "./index.js";
import { DEFAULT_PROCESSING_LIMITS, resolveProcessingLimits } from "./validation/limits.js";
import type { ProcessingLimits } from "./validation/limits.js";

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
  /** Retain only CityObjects whose adapter-provided municipality key matches this value. */
  municipalityKey?: string | undefined;
  /** When set, enriches buildings with construction year from the given GeoPackage. */
  ageZonesFile?: string | undefined;
  /** When set, enriches buildings with groundwater heat-pump availability. */
  geothermalFile?: string | undefined;
  /** Per-file processing limits. */
  limits: ProcessingLimits;
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
 * Reads an optional setting from a flag or environment variable. An empty or
 * blank value counts as unset: orchestrators such as Airflow render optional
 * settings as `""`, which previously reached the tool as an empty path (an
 * empty `AGE_ZONES_FILE` made SQLite open a temporary database and abort).
 *
 * @group CLI
 * @param flag CLI flag.
 * @param envName Environment variable name.
 * @returns The value, or `undefined` if unset or blank.
 */
function readOptionalSetting(flag: string, envName: string): string | undefined {
  const value = readArg(flag) ?? process.env[envName];
  return value === undefined || value.trim() === "" ? undefined : value;
}

/** Flags and environment variables for each processing limit. */
const LIMIT_SETTINGS: Record<keyof ProcessingLimits, [flag: string, envName: string]> = {
  maxFileBytes: ["--max-file-bytes", "MAX_FILE_BYTES"],
  maxNestingDepth: ["--max-nesting-depth", "MAX_NESTING_DEPTH"],
  maxCityObjects: ["--max-city-objects", "MAX_CITY_OBJECTS"],
  maxVertices: ["--max-vertices", "MAX_VERTICES"],
  maxRingVertices: ["--max-ring-vertices", "MAX_RING_VERTICES"],
  maxAdjacencyPairs: ["--max-adjacency-pairs", "MAX_ADJACENCY_PAIRS"],
  maxAdjacencyVertexProducts: ["--max-adjacency-vertex-products", "MAX_ADJACENCY_VERTEX_PRODUCTS"],
};

/**
 * Parses the processing limits; invalid values abort instead of silently
 * disabling a limit.
 *
 * @group CLI
 * @returns Validated limits.
 */
function parseLimits(): ProcessingLimits {
  const overrides: Partial<Record<keyof ProcessingLimits, number>> = {};
  for (const [key, [flag, envName]] of Object.entries(LIMIT_SETTINGS) as [keyof ProcessingLimits, [string, string]][]) {
    const raw = readOptionalSetting(flag, envName);
    if (raw === undefined) continue;
    if (!/^\d+$/.test(raw.trim())) {
      throw new Error(`Invalid value for ${envName}/${flag}: ${JSON.stringify(raw)} (expected a positive integer).`);
    }
    overrides[key] = Number(raw.trim());
  }
  return resolveProcessingLimits(overrides);
}

/**
 * Parses CLI options from arguments and environment variables.
 *
 * @group CLI
 * @returns Normalized CLI configuration.
 */
function parseCliOptions(): CliOptions {
  const srcDir = readArg("--src") ?? process.env.INPUT_DIR ?? "/data";
  const outDir = readOptionalSetting("--out", "OUTPUT_DIR");
  const adjacency = process.argv.includes("--adjacency") || process.env.ADJACENCY === "1";
  const adjacencyTolerance = parseFloat(readArg("--tolerance") ?? process.env.TOLERANCE ?? "0.15");
  const sourceCrsFallback = readOptionalSetting("--source-crs-fallback", "SOURCE_CRS_FALLBACK");
  const addressOutput = readOptionalSetting("--address-output", "ADDRESS_OUTPUT");
  // Not normalized: an empty key must keep filtering everything out rather
  // than silently disable the municipality restriction.
  const municipalityKey = readArg("--municipality-key") ?? process.env.MUNICIPALITY_KEY;
  const ageZonesFile = readOptionalSetting("--age-zones", "AGE_ZONES_FILE");
  const geothermalFile = readOptionalSetting("--geothermal", "GEOTHERMAL_FILE");
  const limits = parseLimits();

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
    limits,
  };
}

/**
 * Prints CLI usage help to stdout.
 *
 * @group CLI
 */
function printUsage(): void {
  console.log(`Usage:
  node dist/cli.mjs --src /data [--out /data/output] [--adjacency] [--tolerance 0.15] [--source-crs-fallback ${spatialConfig.analysisCrs}] [--address-output /data/addresses.sqlite] [--municipality-key 09362000] [--age-zones /data/Baualtersklassen.gpkg] [--geothermal /data/geothermal.gpkg] [--strict]
    [--max-file-bytes N] [--max-nesting-depth N] [--max-city-objects N] [--max-vertices N] [--max-ring-vertices N]
    [--max-adjacency-pairs N] [--max-adjacency-vertex-products N]

Environment alternatives:
  INPUT_DIR=/data
  OUTPUT_DIR=/data/output
  ADJACENCY=1
  TOLERANCE=0.15
  SOURCE_CRS_FALLBACK=${spatialConfig.analysisCrs}
  ADDRESS_OUTPUT=/data/addresses.sqlite
  MUNICIPALITY_KEY=09362000
  AGE_ZONES_FILE=/data/Baualtersklassen.gpkg
  GEOTHERMAL_FILE=/data/geothermal.gpkg
  STRICT=1   # exit non-zero if any file is skipped
  MAX_FILE_BYTES=${DEFAULT_PROCESSING_LIMITS.maxFileBytes}
  MAX_NESTING_DEPTH=${DEFAULT_PROCESSING_LIMITS.maxNestingDepth}
  MAX_CITY_OBJECTS=${DEFAULT_PROCESSING_LIMITS.maxCityObjects}
  MAX_VERTICES=${DEFAULT_PROCESSING_LIMITS.maxVertices}
  MAX_RING_VERTICES=${DEFAULT_PROCESSING_LIMITS.maxRingVertices}
  MAX_ADJACENCY_PAIRS=${DEFAULT_PROCESSING_LIMITS.maxAdjacencyPairs}   # with ADJACENCY=1
  MAX_ADJACENCY_VERTEX_PRODUCTS=${DEFAULT_PROCESSING_LIMITS.maxAdjacencyVertexProducts}   # with ADJACENCY=1

Empty values count as unset. Files exceeding a limit are skipped.`);
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
    limits: options.limits,
  });

  console.log(JSON.stringify(result, null, 2));

  const strict = process.argv.includes("--strict") || process.env.STRICT === "1";
  const report = evaluateRunResult(result, strict);
  console.error(report.message);
  process.exitCode = report.exitCode;
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
