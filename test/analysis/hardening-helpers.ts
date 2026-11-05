/** Shared fixtures for the input hardening tests. */
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

/** A 1 m cube building; `marker` ends up in the output to tell files apart. */
export function cube(marker: string, extra: Record<string, unknown> = {}) {
  return {
    type: "CityJSON",
    version: "2.0",
    transform: { scale: [1, 1, 1], translate: [0, 0, 0] },
    CityObjects: {
      [`B-${marker}`]: {
        type: "Building",
        attributes: { marker },
        geometry: [
          {
            type: "Solid",
            lod: "2",
            boundaries: [[[[0, 3, 2, 1]], [[4, 5, 6, 7]], [[0, 1, 5, 4]], [[1, 2, 6, 5]], [[2, 3, 7, 6]], [[3, 0, 4, 7]]]],
            semantics: {
              surfaces: [{ type: "GroundSurface" }, { type: "RoofSurface" }, { type: "WallSurface" }],
              values: [[0, 1, 2, 2, 2, 2]],
            },
          },
        ],
      },
    },
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    ...extra,
  };
}

export async function withDirs(run: (src: string, out: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "det-hardening-"));
  try {
    const src = join(root, "json");
    const out = join(root, "enriched_json");
    await mkdir(src);
    await mkdir(out);
    await run(src, out);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function put(path: string, content: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content), "utf-8");
}

export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

export const options = { sourceCrsFallback: "EPSG:25832" };
