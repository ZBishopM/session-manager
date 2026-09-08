// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, asPlayer, expectOk, startPocketBase, type ApiClient, type Harness } from "./harness.js";

/**
 * voting_closed.pb.js declaraba `tryCloseVoting` en el nivel superior del
 * fichero de hooks. Cada handler del JSVM corre en una VM del pool donde ese
 * ámbito no existe, así que TODOS los votos reventaban con
 * `ReferenceError: tryCloseVoting is not defined`, tragado por el try/catch
 * del propio hook. La votación no se cerró nunca y las partidas se quedaban
 * para siempre en "voting". Estuvo así meses en producción.
 *
 * Nada lo detectó porque este hook no tenía cobertura de integración.
 *
 * Los votos se emiten como JUGADOR, no como superusuario: la otra mitad del
 * mismo agujero es que escribir siempre como superusuario esconde las reglas
 * de colección (así se coló que match_players era superuser-only).
 */

interface IdRecord {
  id: string;
  [key: string]: unknown;
}

describe("voting_closed cierra la votación cuando han votado todos", () => {
  let h: Harness;
  let alice: { id: string; client: ApiClient };
  let bob: { id: string; client: ApiClient };
  let gameId: string;
  let sessionId: string;
  let matchId: string;

  beforeAll(async () => {
    h = await startPocketBase();

    alice = await asPlayer(h, "alice");
    bob = await asPlayer(h, "bob");

    const game = (await expectOk(
      await api(h).post("/api/collections/games/records", {
        name: "Mancala",
        min_players: 2,
        max_players: 4,
        description: "Ancient seed-sowing game.",
        created_by: alice.id,
      }),
      "create game",
    )) as IdRecord;
    gameId = game.id;

    const session = (await expectOk(
      await api(h).post("/api/collections/sessions/records", {
        host: alice.id,
        status: "active",
        started_at: new Date().toISOString(),
        qr_token: `tok-${Date.now()}`,
      }),
      "create session",
    )) as IdRecord;
    sessionId = session.id;

    for (const playerId of [alice.id, bob.id]) {
      await expectOk(
        await api(h).post("/api/collections/session_participants/records", {
          session: sessionId,
          player: playerId,
          status: "present",
          joined_at: new Date().toISOString(),
        }),
        `add participant ${playerId}`,
      );
    }

    const match = (await expectOk(
      await api(h).post("/api/collections/matches/records", {
        session: sessionId,
        status: "voting",
      }),
      "create match",
    )) as IdRecord;
    matchId = match.id;
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("con un solo voto de dos esperados la partida sigue en votación", async () => {
    await expectOk(
      await alice.client.post("/api/collections/votes/records", {
        match: matchId,
        player: alice.id,
        game: gameId,
      }),
      "alice vota",
    );

    const match = (await expectOk(
      await api(h).get(`/api/collections/matches/records/${matchId}`),
      "get match",
    )) as { game: string; status: string };

    expect(match.game).toBe("");
    expect(match.status).toBe("voting");
  });

  it("con el último voto fija matches.game — esto es lo que estuvo roto", async () => {
    await expectOk(
      await bob.client.post("/api/collections/votes/records", {
        match: matchId,
        player: bob.id,
        game: gameId,
      }),
      "bob vota",
    );

    const match = (await expectOk(
      await api(h).get(`/api/collections/matches/records/${matchId}`),
      "get match",
    )) as { game: string; was_random: boolean };

    expect(match.game).toBe(gameId);
    expect(match.was_random).toBe(false);
  });

  it("el hook no dejó ningún error en el log", () => {
    // El bug original solo se veía aquí: el hook se tragaba su propio
    // ReferenceError y devolvía 200 al cliente.
    expect(h.logs()).not.toContain("[voting_closed] error");
  });
});
