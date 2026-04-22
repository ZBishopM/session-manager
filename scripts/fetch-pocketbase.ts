/**
 * Downloads and caches the PocketBase binary used by integration tests.
 *
 * Idempotent: a second run is a no-op if the cached binary matches
 * POCKETBASE_VERSION. The binary is extracted to `.pocketbase/<version>/`
 * which is gitignored.
 *
 * Override the version via env var:  POCKETBASE_VERSION=0.23.2 npm run fetch:pocketbase
 */

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

export const POCKETBASE_VERSION = process.env.POCKETBASE_VERSION ?? "0.37.3";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = join(ROOT, ".pocketbase", POCKETBASE_VERSION);

function platformSlug(): string {
  const osMap: Record<string, string> = {
    linux: "linux",
    darwin: "darwin",
    win32: "windows",
  };
  const archMap: Record<string, string> = {
    x64: "amd64",
    arm64: "arm64",
  };
  const os = osMap[process.platform];
  const arch = archMap[process.arch];
  if (!os || !arch) {
    throw new Error(
      `Unsupported platform: ${process.platform}/${process.arch}`,
    );
  }
  return `${os}_${arch}`;
}

export function pocketbaseBinaryPath(): string {
  const name = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
  return join(CACHE_DIR, name);
}

export async function ensurePocketBase(): Promise<string> {
  const bin = pocketbaseBinaryPath();
  if (existsSync(bin)) return bin;

  mkdirSync(CACHE_DIR, { recursive: true });
  const slug = platformSlug();
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_${slug}.zip`;

  console.log(`[fetch-pocketbase] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Download failed: ${res.status} ${res.statusText} (url=${url})`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buf);
  const entryName = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
  const entry = zip.getEntry(entryName);
  if (!entry) {
    const names = zip.getEntries().map((e) => e.entryName).join(", ");
    throw new Error(`Binary "${entryName}" not found in zip. Entries: ${names}`);
  }
  writeFileSync(bin, entry.getData());
  if (process.platform !== "win32") {
    chmodSync(bin, 0o755);
  }
  return bin;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensurePocketBase()
    .then((p) => console.log(`[fetch-pocketbase] ready: ${p}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
