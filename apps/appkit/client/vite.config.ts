import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// In dev, the AppKit server plugin runs Vite as middleware over client/.
// For production, `pnpm --filter @dct/appkit-app build` emits client/dist,
// which the server plugin serves statically.
export default defineConfig({
  root: here,
  plugins: [react()],
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
  },
});
