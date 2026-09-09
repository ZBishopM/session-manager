// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, expectOk, startPocketBase, type Harness } from "./harness.js";

/**
 * Mismo bug que voting_closed, encontrado después y vivo en producción hasta
 * hoy: `runWeeklyMatchmaker` estaba declarada en el nivel superior de
 * weekly_matchmaker.pb.js y el callback del cron corre en otra VM, así que
 * cada domingo a las 18:00 el log decía
 * `[weekly_matchmaker] error: ReferenceError: runWeeklyMatchmaker is not defined`
 * y el correo semanal no se envió NUNCA.
 *
 * El cron se dispara a mano con POST /api/crons/{id} (superusuario), que es
 * el mismo camino que usa el planificador: registra el callback, lo ejecuta
 * en una VM del pool y por tanto reproduce el fallo si vuelve.
 */

interface IdRecord {
  id: string;
  [key: string]: unknown;
}

/** POST /api/crons/{id} dispara el trabajo y responde sin esperarlo, así que
 *  hay que darle tiempo a que escriba. Sondear con fecha límite en vez de un
 *  sleep fijo: no alarga el test cuando va rápido ni falla cuando va lento. */
async function waitFor<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  what: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();
  while (!ok(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    last = await read();
  }
  if (!ok(last)) {
    throw new Error(`timeout esperando ${what}: ${JSON.stringify(last)}`);
  }
  return last;
}

async function createUser(h: Harness, nickname: string): Promise<string> {
  const record = (await expectOk(
    await api(h).post("/api/collections/players/records", {
      username: nickname,
      password: "1234",
      passwordConfirm: "1234",
      nickname,
      xp: 0,
      level: 1,
      re_rolls: 0,
    }),
    `create user ${nickname}`,
  )) as IdRecord;
  return record.id;
}

describe("weekly_matchmaker corre desde el cron", () => {
  let h: Harness;
  let hostId: string;
  let playerId: string;

  beforeAll(async () => {
    h = await startPocketBase();

    hostId = await createUser(h, "hostess");
    playerId = await createUser(h, "guest");

    // Solapamiento de 4 h, por encima de MIN_OVERLAP_HOURS (3).
    await expectOk(
      await api(h).post("/api/collections/availabilities/records", {
        player: hostId,
        role: "host",
        weekday: "sat",
        start_hour: 18,
        end_hour: 23,
        capacity: 4,
      }),
      "host availability",
    );
    await expectOk(
      await api(h).post("/api/collections/availabilities/records", {
        player: playerId,
        role: "player",
        weekday: "sat",
        start_hour: 19,
        end_hour: 23,
      }),
      "player availability",
    );
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("el trabajo está registrado", async () => {
    const jobs = (await expectOk(
      await api(h).get("/api/crons"),
      "list crons",
    )) as Array<{ id: string; expression: string }>;

    const job = jobs.find((j) => j.id === "weekly-matchmaker");
    expect(job, `crons registrados: ${jobs.map((j) => j.id).join(", ")}`).toBeDefined();
    expect(job?.expression).toBe("0 18 * * 0");
  });

  it("crea la propuesta y la invitación — esto es lo que nunca ocurrió", async () => {
    const res = await api(h).post("/api/crons/weekly-matchmaker", {});
    expect(res.status, await res.text()).toBeLessThan(300);

    const proposals = await waitFor(
      async () =>
        (await expectOk(
          await api(h).get("/api/collections/match_proposals/records"),
          "list proposals",
        )) as {
          items: Array<{ host: string; weekday: string; start_hour: number; end_hour: number }>;
        },
      (p) => p.items.length > 0,
      "la propuesta del matchmaker",
    );

    expect(proposals.items).toHaveLength(1);
    const proposal = proposals.items[0]!;
    expect(proposal.host).toBe(hostId);
    expect(proposal.weekday).toBe("sat");
    // El rango propuesto es el del anfitrión, no el solapamiento.
    expect(proposal.start_hour).toBe(18);
    expect(proposal.end_hour).toBe(23);

    const invites = await waitFor(
      async () =>
        (await expectOk(
          await api(h).get("/api/collections/invites/records"),
          "list invites",
        )) as { items: Array<{ player: string; response: string; invite_token: string }> },
      (i) => i.items.length > 0,
      "la invitación",
    );

    expect(invites.items).toHaveLength(1);
    const invite = invites.items[0]!;
    expect(invite.player).toBe(playerId);
    expect(invite.response).toBe("pending");
    expect(invite.invite_token.length).toBeGreaterThan(10);
  });

  it("es idempotente: correrlo otra vez no duplica la propuesta", async () => {
    const res = await api(h).post("/api/crons/weekly-matchmaker", {});
    expect(res.status, await res.text()).toBeLessThan(300);

    // Aquí no se puede esperar "a que aparezca algo": lo correcto es que NO
    // aparezca nada nuevo. Margen fijo y luego comprobar que sigue habiendo una.
    await new Promise((r) => setTimeout(r, 1500));

    const proposals = (await expectOk(
      await api(h).get("/api/collections/match_proposals/records"),
      "list proposals again",
    )) as { items: unknown[] };

    expect(proposals.items).toHaveLength(1);
  });

  it("no dejó ningún error en el log", () => {
    // El ReferenceError original solo aparecía aquí.
    expect(h.logs()).not.toContain("[weekly_matchmaker] error");
  });
});
