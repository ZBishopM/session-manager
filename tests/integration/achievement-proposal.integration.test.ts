// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, expectOk, startPocketBase, type Harness } from "./harness.js";

interface IdRecord {
  id: string;
  [key: string]: unknown;
}

async function createPlayer(h: Harness, nickname: string): Promise<{ id: string; token: string }> {
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
    `create player ${nickname}`,
  )) as IdRecord;

  const auth = (await expectOk(
    await api(h).post("/api/collections/players/auth-with-password", {
      identity: nickname,
      password: "1234",
    }),
    `login ${nickname}`,
  )) as { token: string };

  return { id: record.id, token: auth.token };
}

describe("achievement propose/approve gate", () => {
  let h: Harness;
  let gameId: string;
  let player: { id: string; token: string };

  beforeAll(async () => {
    h = await startPocketBase();
    player = await createPlayer(h, "carla");

    const game = (await expectOk(
      await api(h).post("/api/collections/games/records", {
        name: "Catan",
        min_players: 3,
        max_players: 4,
        created_by: player.id,
      }),
      "create game",
    )) as IdRecord;
    gameId = game.id;
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("forces status to pending and proposed_by to the requester, even if the client tries to self-approve", async () => {
    const res = await fetch(`${h.baseUrl}/api/collections/achievements/records`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: player.token },
      body: JSON.stringify({
        game: gameId,
        title: "Longest Road",
        description: "Build the longest road.",
        trigger_expr: "wins_on_game >= 1",
        rarity: "common",
        // Attempting to self-approve — the hook must overwrite this.
        status: "approved",
        proposed_by: "someone-else",
      }),
    });
    const created = (await expectOk(res, "player proposes achievement")) as IdRecord;

    expect(created.status).toBe("pending");
    expect(created.proposed_by).toBe(player.id);
  });

  it("a pending achievement isn't visible to match_finished's approved-only filter", async () => {
    const body = (await expectOk(
      await api(h).get(
        `/api/collections/achievements/records?filter=${encodeURIComponent(
          `game = "${gameId}" && status = "approved"`,
        )}`,
      ),
      "list approved achievements",
    )) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});
