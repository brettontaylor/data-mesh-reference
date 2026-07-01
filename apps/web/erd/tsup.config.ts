import { defineConfig } from "tsup";

// Bundle the ERD into a single self-contained ESM file. Graph deps (React Flow,
// dagre, html-to-image) are inlined; react/react-dom stay external so the module
// shares the host app's React instance (required for hooks). React Flow's CSS is
// injected at runtime via injectStyle, so the host needs no CSS import.
export default defineConfig({
  entry: { erd: "src/index.ts" },
  format: ["esm"],
  platform: "browser", // prefer ESM builds of deps → no CommonJS `require` interop shim
  outDir: "dist",
  dts: true,
  clean: false, // overwrite in place so a watching dev server HMRs instead of breaking
  minify: true,
  treeshake: true,
  splitting: false, // single self-contained dist/erd.js for a clean drop-in
  external: ["react", "react-dom", "react/jsx-runtime"],
  noExternal: ["elkjs"], // force ELK to be inlined so the host needs no extra dependency
  // zustand's use-sync-external-store shim does a CJS `require("react")`. React is
  // external (shared with the host), so resolve that require to the host's ESM React
  // instead of letting it hit the bundler's throwing require stub.
  banner: {
    js: [
      'import * as __erdReact from "react";',
      'const require = (m) => { if (m === "react") return __erdReact; return {}; };',
    ].join("\n"),
  },
});
