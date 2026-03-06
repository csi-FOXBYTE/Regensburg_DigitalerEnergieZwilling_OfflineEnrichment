import { resolve } from "node:path";

type TinyGlobFn = (
  pattern: string,
  opts?: { cwd?: string; absolute?: boolean; filesOnly?: boolean; dot?: boolean },
) => Promise<string[]>;

async function loadTinyGlob(): Promise<TinyGlobFn> {
  const module = await import("tiny-glob");
  return (module as { default?: TinyGlobFn }).default ?? (module as unknown as TinyGlobFn);
}

export async function listJsonFiles(srcDir: string): Promise<string[]> {
  const glob = await loadTinyGlob();
  return glob("**/*.json", {
    cwd: resolve(srcDir),
    absolute: true,
    filesOnly: true,
  });
}
