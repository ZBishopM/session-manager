/// <reference types="vitest" />
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";
import { PWA_OPTIONS } from "./src/lib/pwa-config.js";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), SvelteKitPWA(PWA_OPTIONS)],
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
