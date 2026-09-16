import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "admin-src",
  base: "/lesson-quiz/admin-v2/",
  build: {
    outDir: resolve(__dirname, "admin-v2"),
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["admin-src/**/*.test.ts"],
  },
});
