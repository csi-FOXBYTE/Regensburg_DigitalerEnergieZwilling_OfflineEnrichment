import { resolve } from "node:path";

/**
 * Signature for the dynamically loaded `tiny-glob` export.
 *
 * @group Discovery
 */
type TinyGlobFn = (
  pattern: string,
  opts?: { cwd?: string; absolute?: boolean; filesOnly?: boolean; dot?: boolean },
) => Promise<string[]>;

/**
 * Loads `tiny-glob` lazily to keep ESM/CJS interoperability robust.
 *
 * @group Discovery
 * @returns Callable glob function.
 */
async function loadTinyGlob(): Promise<TinyGlobFn> {
  const module = await import("tiny-glob");
  return (module as { default?: TinyGlobFn }).default ?? (module as unknown as TinyGlobFn);
}

/**
 * Recursively lists all JSON files under a source directory.
 *
 * @group Discovery
 * @param srcDir Source directory.
 * @returns Absolute paths of discovered JSON files.
 */
export async function listJsonFiles(srcDir: string): Promise<string[]> {
  const glob = await loadTinyGlob();
  return glob("**/*.json", {
    cwd: resolve(srcDir),
    absolute: true,
    filesOnly: true,
  });
}
