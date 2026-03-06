import { processCityJsonFiles } from "./index.js";

interface CliOptions {
  srcDir: string;
  sourceCrsFallback?: string | undefined;
}

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

function parseCliOptions(): CliOptions {
  const srcDir = readArg("--src") ?? process.env.INPUT_DIR ?? "/data";
  const sourceCrsFallback =
    readArg("--source-crs-fallback") ?? process.env.SOURCE_CRS_FALLBACK;

  return {
    srcDir,
    sourceCrsFallback,
  };
}

function printUsage(): void {
  console.log(`Usage:
  node dist/cli.mjs --src /data [--source-crs-fallback EPSG:25832]

Environment alternatives:
  INPUT_DIR=/data
  SOURCE_CRS_FALLBACK=EPSG:25832`);
}

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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(message);
  process.exitCode = 1;
});
