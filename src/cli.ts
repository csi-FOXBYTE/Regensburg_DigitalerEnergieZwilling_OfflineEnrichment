import { processCityJsonFiles } from "./index.js";

/**
 * CLI options for processing CityJSON files.
 *
 * @group CLI
 */
interface CliOptions {
  /** Source directory containing JSON files to process. */
  srcDir: string;
  /** Optional fallback for missing CRS information in the input. */
  sourceCrsFallback?: string | undefined;
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
  const sourceCrsFallback =
    readArg("--source-crs-fallback") ?? process.env.SOURCE_CRS_FALLBACK;

  return {
    srcDir,
    sourceCrsFallback,
  };
}

/**
 * Prints CLI usage help to stdout.
 *
 * @group CLI
 */
function printUsage(): void {
  console.log(`Usage:
  node dist/cli.mjs --src /data [--source-crs-fallback EPSG:25832]

Environment alternatives:
  INPUT_DIR=/data
  SOURCE_CRS_FALLBACK=EPSG:25832`);
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
    sourceCrsFallback: options.sourceCrsFallback,
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
