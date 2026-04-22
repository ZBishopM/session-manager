// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, expectOk, startPocketBase, type Harness } from "./harness.js";

interface IdRecord {
  id: string;
  [key: string]: unknown;
}

async function createUser(
  h: Harness,
  nickname: string,
): Promise<string> {
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

describe("match_finished hook fires on status=done", () => {
  let h: Harness;
  let winnerId: string;
  let loserId: string;
  let gameId: string;
  let sessionId: string;
  let matchId: string;
  let firstWinAchievementId: string;

  beforeAll(async () => {
    h = await startPocketBase();

    winnerId = await createUser(h, "alice");
    loserId = await createUser(h, "bob");

    const game = (await expectOk(
      await api(h).post("/api/collections/games/records", {
        name: "Mancala",
        min_players: 2,
        max_players: 2,
        description: "Ancient seed-sowing game.",
        owned_by: [winnerId],
        created_by: winnerId,
      }),
      "create game",
    )) as IdRecord;
    gameId = game.id;

    const ach = (await expectOk(
      await api(h).post("/api/collections/achievements/records", {
        game: gameId,
        title: "First Stone",
        description: "Your first Mancala win — you have moved the first pebble of many.",
        trigger_expr: "wins_on_game >= 1",
        rarity: "common",
      }),
      "create achievement",
    )) as IdRecord;
    firstWinAchievementId = ach.id;

    const session = (await expectOk(
      await api(h).post("/api/collections/sessions/records", {
        host: winnerId,
        co_host: loserId,
        status: "active",
        started_at: new Date().toISOString(),
        qr_token: `tok-${Date.now()}`,
      }),
      "create session",
    )) as IdRecord;
    sessionId = session.id;

    const match = (await expectOk(
      await api(h).post("/api/collections/matches/records", {
        session: sessionId,
        game: gameId,
        status: "playing",
        started_at: new Date().toISOString(),
        was_random: false,
      }),
      "create match",
    )) as IdRecord;
    matchId = match.id;

    await expectOk(
      await api(h).post("/api/collections/match_players/records", {
        match: matchId,
        player: winnerId,
        won: true,
        rating: "like",
      }),
      "create match_player winner",
    );
    await expectOk(
      await api(h).post("/api/collections/match_players/records", {
        match: matchId,
        player: loserId,
        won: false,
      }),
      "create match_player loser",
    );
  }, 90_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("awards XP to both players when the match transitions to done", async () => {
    const beforeWinner = (await expectOk(
      await api(h).get(`/api/collections/players/records/${winnerId}`),
      "get winner before",
    )) as { xp: number };
    const beforeLoser = (await expectOk(
      await api(h).get(`/api/collections/players/records/${loserId}`),
      "get loser before",
    )) as { xp: number };

    expect(beforeWinner.xp).toBe(0);
    expect(beforeLoser.xp).toBe(0);

    await expectOk(
      await api(h).patch(`/api/collections/matches/records/${matchId}`, {
        status: "done",
        ended_at: new Date().toISOString(),
        duration_seconds: 900,
      }),
      "mark match done",
    );

    const afterWinner = (await expectOk(
      await api(h).get(`/api/collections/players/records/${winnerId}`),
      "get winner after",
    )) as { xp: number; level: number };
    const afterLoser = (await expectOk(
      await api(h).get(`/api/collections/players/records/${loserId}`),
      "get loser after",
    )) as { xp: number; level: number };

    // Winner: participate(10) + win(15) + rate_game(2) + achievement_common(10) = 37
    // Loser:  participate(10) = 10
    expect(afterWinner.xp).toBe(37);
    expect(afterLoser.xp).toBe(10);
    expect(afterWinner.level).toBe(1);
    expect(afterLoser.level).toBe(1);
  });

  it("inserts a player_achievements record only for the winner", async () => {
    const body = (await expectOk(
      await api(h).get(
        `/api/collections/player_achievements/records?filter=${encodeURIComponent(
          `achievement = "${firstWinAchievementId}"`,
        )}`,
      ),
      "list unlocks",
    )) as { items: Array<{ player: string; achievement: string }> };

    const unlocked = body.items.map((r) => r.player);
    expect(unlocked).toContain(winnerId);
    expect(unlocked).not.toContain(loserId);
    expect(body.items).toHaveLength(1);
  });

  it("is idempotent: editing the already-done match does not re-award", async () => {
    await expectOk(
      await api(h).patch(`/api/collections/matches/records/${matchId}`, {
        duration_seconds: 901,
      }),
      "touch match",
    );

    const winner = (await expectOk(
      await api(h).get(`/api/collections/players/records/${winnerId}`),
      "re-fetch winner",
    )) as { xp: number };
    expect(winner.xp).toBe(37);

    const body = (await expectOk(
      await api(h).get(
        `/api/collections/player_achievements/records?filter=${encodeURIComponent(
          `player = "${winnerId}"`,
        )}`,
      ),
      "re-fetch winner unlocks",
    )) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });
});
