/// <reference types="vitest" />
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./src/vitest-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/lib/**/*.svelte", "scripts/**/*.ts"],
      exclude: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
