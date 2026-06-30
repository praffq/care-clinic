import { defineConfig } from "vite";
import { writeFileSync } from "node:fs";

// base "./" so the built assets work when embedded + served by Wails.
// keep-dist re-creates the tracked placeholder vite's emptyOutDir wipes, so a
// clean checkout still compiles the //go:embed all:frontend/dist.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [
    {
      name: "keep-dist",
      closeBundle() {
        writeFileSync("dist/.gitkeep", "");
      },
    },
  ],
});
