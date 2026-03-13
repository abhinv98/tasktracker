import { defineConfig } from "vite";
import path from "node:path";
import { builtinModules } from "node:module";

const nodeBuiltins = builtinModules.flatMap((m) => [m, `node:${m}`]);

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "../dist-electron"),
    emptyOutDir: true,
    lib: {
      entry: {
        main: path.resolve(__dirname, "main.ts"),
        preload: path.resolve(__dirname, "preload.ts"),
      },
      formats: ["cjs"],
    },
    rollupOptions: {
      external: ["electron", ...nodeBuiltins],
      output: {
        entryFileNames: "[name].js",
      },
    },
    minify: false,
    sourcemap: true,
    target: "node20",
  },
  resolve: {
    conditions: ["node"],
  },
});
