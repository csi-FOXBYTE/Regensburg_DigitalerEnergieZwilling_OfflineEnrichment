// Derives the SBOM embedded in the runtime image from the repository SBOM.
//
// The repository SBOM also lists development dependencies (build, test and
// documentation tooling). They are not installed in the runtime image, but
// image scanners report every component of an embedded SBOM as present. This
// keeps the npm components that are actually installed in the given
// node_modules directory and all non-npm components (base image, system
// packages).
//
// usage: node scripts/runtime-sbom.mjs <SBOM.cdx.json> <node_modules> <output>
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [sbomPath, nodeModulesPath, outputPath] = process.argv.slice(2);
if (!sbomPath || !nodeModulesPath || !outputPath) {
  console.error("usage: node scripts/runtime-sbom.mjs <SBOM.cdx.json> <node_modules> <output>");
  process.exit(2);
}

/** Collects `name@version` of every package installed in a pnpm node_modules tree. */
async function installedPackages(nodeModules) {
  const installed = new Set();
  const store = join(nodeModules, ".pnpm");
  for (const entry of await readdir(store, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const packages = join(store, entry.name, "node_modules");
    for (const name of await readdir(packages)) {
      const dirs = name.startsWith("@")
        ? (await readdir(join(packages, name))).map((child) => join(packages, name, child))
        : [join(packages, name)];
      for (const dir of dirs) {
        try {
          const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
          installed.add(`${manifest.name}@${manifest.version}`);
        } catch {
          // not a package directory
        }
      }
    }
  }
  return installed;
}

/** Returns `name@version` for an npm purl, or null for other ecosystems. */
function npmPackage(component) {
  const purl = component.purl ?? "";
  if (!purl.startsWith("pkg:npm/")) return null;
  return decodeURIComponent(purl.slice("pkg:npm/".length).split(/[?#]/)[0]);
}

const bom = JSON.parse(await readFile(sbomPath, "utf8"));
const totalComponents = bom.components.length;
const installed = await installedPackages(nodeModulesPath);

const components = bom.components.filter((component) => {
  const pkg = npmPackage(component);
  return pkg === null || installed.has(pkg);
});
const kept = new Set(components.map((component) => component["bom-ref"]));
kept.add(bom.metadata.component["bom-ref"]);

const listed = new Set(components.map(npmPackage).filter(Boolean));
const unlisted = [...installed].filter((pkg) => !listed.has(pkg)).sort();
if (unlisted.length > 0) {
  console.warn(`runtime-sbom: installed packages missing from ${sbomPath}: ${unlisted.join(", ")}`);
}

bom.components = components;
bom.dependencies = (bom.dependencies ?? [])
  .filter((entry) => kept.has(entry.ref))
  .map((entry) => ({ ...entry, dependsOn: (entry.dependsOn ?? []).filter((ref) => kept.has(ref)) }));
bom.metadata.properties = [
  ...(bom.metadata.properties ?? []),
  {
    name: "sbom:image-scope",
    value: "Runtime image: npm components limited to the packages installed in the image.",
  },
];

await writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`);
console.log(`runtime-sbom: kept ${components.length} of ${totalComponents} components`);
