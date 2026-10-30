import { lstat, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

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
 * Symlinks are skipped and every match is confined to `srcDir`: a crafted
 * `*.json` symlink (or a symlinked directory) could otherwise resolve to a
 * file outside the input directory and have it read and written back,
 * amounting to path traversal on untrusted input. Regular pipeline files are
 * never symlinks, so this filtering is transparent for normal runs.
 *
 * @group Discovery
 * @param srcDir Source directory.
 * @returns Absolute paths of discovered JSON files.
 */
export async function listJsonFiles(srcDir: string): Promise<string[]> {
  const glob = await loadTinyGlob();
  const root = resolve(srcDir);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  const candidates = await glob("**/*.json", {
    cwd: root,
    absolute: true,
    filesOnly: true,
  });

  const files: string[] = [];
  for (const candidate of candidates) {
    let stats;
    try {
      stats = await lstat(candidate);
    } catch {
      continue;
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      continue;
    }
    let resolved;
    try {
      resolved = await realpath(candidate);
    } catch {
      continue;
    }
    if (resolved !== root && !resolved.startsWith(prefix)) {
      continue;
    }
    files.push(candidate);
  }
  return files;
}
