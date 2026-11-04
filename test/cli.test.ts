import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = join(process.cwd(), "src", "cli.ts");

const VALID = JSON.stringify({
  type: "CityJSON",
  version: "2.0",
  transform: { scale: [1, 1, 1], translate: [0, 0, 0] },
  CityObjects: {
    b1: {
      type: "Building",
      geometry: [{
        type: "MultiSurface",
        lod: "2",
        boundaries: [[[0, 1, 2, 3]]],
        semantics: { surfaces: [{ type: "GroundSurface" }], values: [0] },
      }],
    },
  },
  vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
});

/** Runs the CLI with only the given environment (plus PATH) and returns its exit code and stderr. */
async function runCli(env: Record<string, string>): Promise<{ code: number; stderr: string }> {
  try {
    const { stderr } = await execFileAsync(process.execPath, ["--import", "tsx", CLI], {
      env: { PATH: process.env.PATH ?? "", ...env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stderr };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    return { code: failure.code ?? -1, stderr: failure.stderr ?? "" };
  }
}

async function withInput(files: Record<string, string>, run: (src: string, out: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "det-cli-"));
  try {
    const src = join(root, "json");
    const out = join(root, "out");
    await mkdir(src);
    await mkdir(out);
    for (const [name, content] of Object.entries(files)) await writeFile(join(src, name), content);
    await run(src, out);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("cli: empty optional paths such as AGE_ZONES_FILE count as unset", async () => {
  await withInput({ "tile.json": VALID }, async (src, out) => {
    const result = await runCli({
      INPUT_DIR: src,
      OUTPUT_DIR: out,
      SOURCE_CRS_FALLBACK: "",
      AGE_ZONES_FILE: "",
      GEOTHERMAL_FILE: " ",
      ADDRESS_OUTPUT: "",
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /Processed 1 file\(s\), skipped 0 of 1/);
  });
});

test("cli: STRICT=1 fails a partial batch that otherwise succeeds", async () => {
  await withInput({ "tile.json": VALID, "broken.json": "{" }, async (src, out) => {
    const lenient = await runCli({ INPUT_DIR: src, OUTPUT_DIR: out });
    assert.equal(lenient.code, 0, lenient.stderr);
    const strict = await runCli({ INPUT_DIR: src, OUTPUT_DIR: out, STRICT: "1" });
    assert.equal(strict.code, 1);
    assert.match(strict.stderr, /Strict mode: 1 of 2 file\(s\) were skipped/);
  });
});
