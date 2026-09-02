/**
 * Starts a real PocketBase instance (fresh temp data dir, current
 * pb_hooks/pb_migrations from this checkout) in the foreground on a fixed
 * port, for Playwright's `webServer` to drive alongside `npm run dev`.
 *
 * Not for parallel/CI-matrix use — tests/integration/harness.ts (random
 * free port per call) is the right tool there. This one exists because
 * Playwright's webServer wants a plain shell command with a fixed,
 * known port to poll for readiness, not a spawned-and-tracked child
 * process the way the vitest integration harness manages it.
 */

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePocketBase } from "./fetch-pocketbase.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PB_PORT ?? "8090";

async function main(): Promise<void> {
  const pbPath = await ensurePocketBase();
  const dataDir = mkdtempSync(join(tmpdir(), "pb-e2e-"));
  console.log(`[e2e-pocketbase] data dir: ${dataDir}`);
  console.log(`[e2e-pocketbase] starting on 127.0.0.1:${PORT}`);

  const proc = spawn(
    pbPath,
    [
      "serve",
      `--http=127.0.0.1:${PORT}`,
      "--dir",
      dataDir,
      "--hooksDir",
      join(ROOT, "pb_hooks"),
      "--migrationsDir",
      join(ROOT, "pb_migrations"),
    ],
    { stdio: "inherit" },
  );

  const cleanup = async (): Promise<void> => {
    proc.kill();
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  };
  process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
  process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
  proc.on("exit", (code) => {
    void cleanup().then(() => process.exit(code ?? 0));
  });
}

void main();
