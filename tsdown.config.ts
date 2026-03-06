import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts", "src/cli.ts"],
    dts: "local-only",
    outDir: "dist",
    publint: false,
    exports: true,
    sourcemap: true,
    deps: {
        neverBundle: ["proj4", "tiny-glob"],
    },
    format: {
        esm: {
            target: ["es2015"]
        },
        cjs: {
            target: ["node20"]
        }
    }
});
