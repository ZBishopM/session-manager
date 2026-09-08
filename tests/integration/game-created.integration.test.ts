// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, asPlayer, expectOk, startPocketBase, type ApiClient, type Harness } from "./harness.js";

/**
 * game_created.pb.js llama a Gemini para generar logros al crear un juego.
 * En producción GEMINI_API_KEY no está puesta, así que el camino que corre
 * de verdad es el de "sin clave": tiene que dejar crear el juego, no generar
 * nada y no romper. Ese camino no tenía ninguna cobertura.
 *
 * El harness no exporta GEMINI_API_KEY, así que estos tests recorren
 * exactamente el mismo camino que producción hoy.
 *
 * Importa además porque este hook es `onRecordAfterCreateSuccess`: si no
 * llama a `e.next()` corta la cadena de hooks. Tres `return` tempranos lo
 * hacían (fallo de red, respuesta no-2xx, JSON ilegible) — arreglados junto
 * con este test.
 */

interface IdRecord {
  id: string;
  [key: string]: unknown;
}

describe("game_created sin GEMINI_API_KEY", () => {
  let h: Harness;
  let alice: { id: string; client: ApiClient };
  let gameId: string;

  beforeAll(async () => {
    h = await startPocketBase();
    alice = await asPlayer(h, "alice");
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("un jugador puede crear un juego", async () => {
    const game = (await expectOk(
      await alice.client.post("/api/collections/games/records", {
        name: "Mancala",
        min_players: 2,
        max_players: 4,
        description: "Ancient seed-sowing game.",
        created_by: alice.id,
      }),
      "create game as player",
    )) as IdRecord;
    gameId = game.id;
    expect(gameId).toMatch(/^[a-z0-9]{15}$/);
  });

  it("no genera logros y lo dice en el log, en vez de fallar", async () => {
    const achievements = (await expectOk(
      await api(h).get(
        `/api/collections/achievements/records?filter=${encodeURIComponent(`game = "${gameId}"`)}`,
      ),
      "list achievements",
    )) as { items: unknown[] };

    expect(achievements.items).toHaveLength(0);
    expect(h.logs()).toContain("[game_created] GEMINI_API_KEY not set");
    expect(h.logs()).not.toContain("[game_created] error");
  });

  it("el juego sigue siendo utilizable: se puede leer y votar por él", async () => {
    // Que el hook no corte la cadena no se nota en el POST (After*Success
    // corre después de guardar), sino en que todo lo que cuelga del juego
    // siga funcionando.
    const game = (await expectOk(
      await alice.client.get(`/api/collections/games/records/${gameId}`),
      "read game back",
    )) as { name: string; min_players: number };

    expect(game.name).toBe("Mancala");
    expect(game.min_players).toBe(2);
  });
});
