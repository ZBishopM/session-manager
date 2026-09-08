/**
 * Spins up a real PocketBase server against our migrations and hooks in a
 * temporary data directory, returns a client authenticated as superuser.
 *
 * Each call gets its own port + temp dir so test files are isolated even
 * when vitest runs them in the same worker.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePocketBase } from "../../scripts/fetch-pocketbase.js";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MIGRATIONS_DIR = join(ROOT, "pb_migrations");
const HOOKS_DIR = join(ROOT, "pb_hooks");

export const SUPERUSER_EMAIL = "admin@test.local";
export const SUPERUSER_PASSWORD = "TestPassword12345!";

export interface Harness {
  baseUrl: string;
  dataDir: string;
  token: string;
  proc: ChildProcess;
  logs: () => string;
  stop: () => Promise<void>;
}

export interface ApiClient {
  get: (path: string) => Promise<Response>;
  post: (path: string, body: unknown) => Promise<Response>;
  patch: (path: string, body: unknown) => Promise<Response>;
  del: (path: string) => Promise<Response>;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForReady(url: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
      lastErr = `HTTP ${r.status}`;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastErr}`);
}

export async function startPocketBase(): Promise<Harness> {
  const pb = await ensurePocketBase();
  const dataDir = await mkdtemp(join(tmpdir(), "pb-test-"));
  const port = await findFreePort();

  // Create the superuser; in v0.22 this auto-creates the _superusers
  // collection and persists to the data dir so serve picks it up.
  execFileSync(
    pb,
    [
      "superuser",
      "upsert",
      SUPERUSER_EMAIL,
      SUPERUSER_PASSWORD,
      "--dir",
      dataDir,
    ],
    { stdio: "pipe" },
  );

  const proc = spawn(
    pb,
    [
      "serve",
      `--http=127.0.0.1:${port}`,
      "--dir",
      dataDir,
      "--hooksDir",
      HOOKS_DIR,
      "--migrationsDir",
      MIGRATIONS_DIR,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const logChunks: string[] = [];
  const debug = process.env.PB_DEBUG === "1";
  proc.stdout?.on("data", (c: Buffer) => {
    const s = c.toString("utf8");
    logChunks.push(s);
    if (debug) process.stderr.write(`[pb] ${s}`);
  });
  proc.stderr?.on("data", (c: Buffer) => {
    const s = c.toString("utf8");
    logChunks.push(s);
    if (debug) process.stderr.write(`[pb] ${s}`);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForReady(`${baseUrl}/api/health`);
  } catch (err) {
    proc.kill();
    throw new Error(
      `PocketBase did not start.\nstdout+stderr:\n${logChunks.join("")}\n\n${err}`,
    );
  }

  const loginRes = await fetch(
    `${baseUrl}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identity: SUPERUSER_EMAIL,
        password: SUPERUSER_PASSWORD,
      }),
    },
  );
  if (!loginRes.ok) {
    proc.kill();
    throw new Error(
      `superuser auth failed: ${loginRes.status} ${await loginRes.text()}`,
    );
  }
  const { token } = (await loginRes.json()) as { token: string };

  return {
    baseUrl,
    dataDir,
    token,
    proc,
    logs: () => logChunks.join(""),
    stop: async () => {
      proc.kill();
      await new Promise<void>((resolve) => {
        proc.once("exit", () => resolve());
        setTimeout(resolve, 2000);
      });
      await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export function api(h: Harness): ApiClient {
  const headers = {
    "content-type": "application/json",
    Authorization: h.token,
  };
  return {
    get: (path) => fetch(`${h.baseUrl}${path}`, { headers: { Authorization: h.token } }),
    post: (path, body) =>
      fetch(`${h.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    patch: (path, body) =>
      fetch(`${h.baseUrl}${path}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      }),
    del: (path) =>
      fetch(`${h.baseUrl}${path}`, {
        method: "DELETE",
        headers: { Authorization: h.token },
      }),
  };
}

/**
 * Un ApiClient autenticado como jugador normal, no como superusuario.
 *
 * Existe por una razón concreta: los tests de integración escribían todo
 * como superusuario y los unitarios mockean PocketBase, así que ninguna capa
 * recorría el camino de un jugador de verdad. Por eso pasó desapercibido
 * durante meses que match_players y matches.update eran superuser-only y que
 * registrar el resultado de una partida NUNCA funcionó desde el navegador.
 *
 * El jugador se crea con el token de superusuario (players.createRule es
 * abierta para el registro, pero así no dependemos de ello) y a partir de
 * ahí todas las peticiones van con su propio token.
 */
export async function asPlayer(
  h: Harness,
  nickname: string,
  passcode = "1234",
): Promise<{ id: string; client: ApiClient }> {
  const created = (await expectOk(
    await api(h).post("/api/collections/players/records", {
      username: nickname,
      password: passcode,
      passwordConfirm: passcode,
      nickname,
      xp: 0,
      level: 1,
      re_rolls: 0,
    }),
    `create player ${nickname}`,
  )) as { id: string };

  const auth = (await expectOk(
    await fetch(`${h.baseUrl}/api/collections/players/auth-with-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity: nickname, password: passcode }),
    }),
    `auth player ${nickname}`,
  )) as { token: string };

  const headers = { "content-type": "application/json", Authorization: auth.token };
  const client: ApiClient = {
    get: (path) => fetch(`${h.baseUrl}${path}`, { headers: { Authorization: auth.token } }),
    post: (path, body) =>
      fetch(`${h.baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
    patch: (path, body) =>
      fetch(`${h.baseUrl}${path}`, { method: "PATCH", headers, body: JSON.stringify(body) }),
    del: (path) =>
      fetch(`${h.baseUrl}${path}`, {
        method: "DELETE",
        headers: { Authorization: auth.token },
      }),
  };

  return { id: created.id, client };
}

export async function expectOk(res: Response, ctx: string): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${ctx}: ${res.status} ${res.statusText} :: ${text}`);
  }
  return res.json();
}

// Keep unused helpers around so the harness is self-sufficient.
export { mkdtempSync };
