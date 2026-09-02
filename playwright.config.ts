import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser end-to-end tests. Distinct from `npm run test`
 * (vitest + testing-library, component-level, no real browser and no
 * real backend) and `npm run test:integration` (real PocketBase, but no
 * browser/frontend at all). This is the only layer that can catch a bug
 * like the one that motivated it: signup blocked by the browser's own
 * native pattern-mismatch validation because of a wrong `autocomplete`
 * value inviting a password manager to autofill an incompatible value —
 * invisible to both other test layers, since neither drives a real
 * browser's autofill/native-validation behavior against a real backend.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // shared PocketBase instance across the whole run
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "npx tsx scripts/e2e-pocketbase.ts",
      url: "http://127.0.0.1:8090/api/health",
      timeout: 30_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      timeout: 30_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
