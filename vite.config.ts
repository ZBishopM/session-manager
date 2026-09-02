/// <reference types="vitest" />
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";
import { PWA_OPTIONS } from "./src/lib/pwa-config.js";

// pb() (src/lib/pb.ts) always targets the relative "/" origin — correct in
// production, where nginx proxies /api and /_ to PocketBase on the same
// domain, but `npm run dev` has no such proxy by default, so the frontend
// has never actually been able to reach a real PocketBase without one.
// PB_PORT lets the E2E harness (scripts/e2e-pocketbase.ts) point this at
// whichever port it started PocketBase on; defaults to 8090 to match the
// port used everywhere else in this repo (docs, integration test harness).
const PB_PORT = process.env.PB_PORT ?? "8090";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), SvelteKitPWA(PWA_OPTIONS)],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${PB_PORT}`,
      "/_": `http://127.0.0.1:${PB_PORT}`,
    },
  },
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
