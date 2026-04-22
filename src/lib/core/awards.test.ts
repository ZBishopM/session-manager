import { describe, expect, it } from "vitest";
import {
  type AchievementDef,
  type MatchOutcome,
  type UserStats,
  computeMatchAwards,
  emptyStats,
} from "./awards.js";
import { xpForAction } from "./xp.js";

const game = "game-1";
const match: Omit<MatchOutcome, "players"> = {
  matchId: "m-1",
  gameId: game,
  durationSeconds: 1800,
};

function withPlayers(players: MatchOutcome["players"]): MatchOutcome {
  return { ...match, players };
}

describe("computeMatchAwards — XP", () => {
  it("awards participate_match to every player", () => {
    const r = computeMatchAwards(
      withPlayers([
        { userId: "u1", won: false },
        { userId: "u2", won: false },
      ]),
      {},
      [],
      {},
    );
    expect(r).toHaveLength(2);
    for (const a of r) {
      expect(a.xpBreakdown.map((b) => b.action)).toContain("participate_match");
    }
  });

  it("awards win_match only to winners", () => {
    const r = computeMatchAwards(
      withPlayers([
        { userId: "u1", won: true },
        { userId: "u2", won: false },
      ]),
      {},
      [],
      {},
    );
    const u1 = r.find((x) => x.userId === "u1")!;
    const u2 = r.find((x) => x.userId === "u2")!;
    expect(u1.xpBreakdown.some((b) => b.action === "win_match")).toBe(true);
    expect(u2.xpBreakdown.some((b) => b.action === "win_match")).toBe(false);
  });

  it("winner gets participate + win xp combined", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true }]),
      {},
      [],
      {},
    );
    expect(r[0]!.xpDelta).toBe(
      xpForAction("participate_match") + xpForAction("win_match"),
    );
  });

  it("awards rate_game when liked is set (either 👍 or 👎)", () => {
    const r = computeMatchAwards(
      withPlayers([
        { userId: "u1", won: false, liked: true },
        { userId: "u2", won: false, liked: false },
        { userId: "u3", won: false, liked: null },
      ]),
      {},
      [],
      {},
    );
    const count = (id: string) =>
      r.find((x) => x.userId === id)!.xpBreakdown.filter((b) => b.action === "rate_game").length;
    expect(count("u1")).toBe(1);
    expect(count("u2")).toBe(1);
    expect(count("u3")).toBe(0);
  });

  it("supports team wins: multiple players can have won=true", () => {
    const r = computeMatchAwards(
      withPlayers([
        { userId: "u1", won: true },
        { userId: "u2", won: true },
        { userId: "u3", won: false },
      ]),
      {},
      [],
      {},
    );
    expect(r.filter((x) => x.xpBreakdown.some((b) => b.action === "win_match")))
      .toHaveLength(2);
  });
});

describe("computeMatchAwards — achievements", () => {
  const fifthWin: AchievementDef = {
    id: "ach-5wins",
    triggerExpr: "wins_on_game >= 5",
    rarity: "rare",
  };
  const streak3: AchievementDef = {
    id: "ach-streak3",
    triggerExpr: "current_streak_wins >= 3",
    rarity: "common",
  };
  const marathon: AchievementDef = {
    id: "ach-marathon",
    triggerExpr: "match_duration_minutes >= 60",
    rarity: "epic",
  };
  const loyalLoser: AchievementDef = {
    id: "ach-loyal-loser",
    triggerExpr: "losses_on_game >= 3 && wins_on_game == 0",
    rarity: "common",
  };

  const baseStats = (partial: Partial<UserStats>): UserStats => ({
    ...emptyStats("u1"),
    ...partial,
  });

  it("unlocks achievement when threshold is crossed by this match", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true }]),
      { u1: baseStats({ winsOnGame: 4 }) },
      [fifthWin],
      {},
    );
    expect(r[0]!.unlockedAchievementIds).toEqual(["ach-5wins"]);
  });

  it("does not unlock if threshold is not reached", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true }]),
      { u1: baseStats({ winsOnGame: 3 }) },
      [fifthWin],
      {},
    );
    expect(r[0]!.unlockedAchievementIds).toEqual([]);
  });

  it("does not re-award an already-unlocked achievement", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true }]),
      { u1: baseStats({ winsOnGame: 10 }) },
      [fifthWin],
      { u1: new Set(["ach-5wins"]) },
    );
    expect(r[0]!.unlockedAchievementIds).toEqual([]);
    expect(r[0]!.xpBreakdown.some((b) => b.action.startsWith("achievement_")))
      .toBe(false);
  });

  it("awards extra XP based on achievement rarity", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true }]),
      { u1: baseStats({ winsOnGame: 4 }) },
      [fifthWin],
      {},
    );
    expect(
      r[0]!.xpBreakdown.find((b) => b.action === "achievement_rare")?.xp,
    ).toBe(xpForAction("achievement_rare"));
  });

  it("evaluates streak triggers using post-match stats", () => {
    // Player had 2-win streak, wins again → streak = 3, unlock.
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true }]),
      { u1: baseStats({ currentStreakWins: 2 }) },
      [streak3],
      {},
    );
    expect(r[0]!.unlockedAchievementIds).toContain("ach-streak3");
  });

  it("resets win streak on a loss", () => {
    // Player had 2-win streak, loses → streak_wins=0, streak_losses=1.
    // streak3 should NOT unlock.
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: false }]),
      { u1: baseStats({ currentStreakWins: 2 }) },
      [streak3],
      {},
    );
    expect(r[0]!.unlockedAchievementIds).not.toContain("ach-streak3");
  });

  it("match_duration_minutes is available to triggers", () => {
    const r = computeMatchAwards(
      { ...match, durationSeconds: 3600, players: [{ userId: "u1", won: false }] },
      {},
      [marathon],
      {},
    );
    expect(r[0]!.unlockedAchievementIds).toContain("ach-marathon");
  });

  it("compound triggers (loyal-loser) work on current totals", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: false }]),
      { u1: baseStats({ lossesOnGame: 2, winsOnGame: 0 }) }, // after match: losses=3
      [loyalLoser],
      {},
    );
    expect(r[0]!.unlockedAchievementIds).toContain("ach-loyal-loser");
  });

  it("can unlock multiple achievements in one match", () => {
    const r = computeMatchAwards(
      { ...match, durationSeconds: 3600, players: [{ userId: "u1", won: true }] },
      { u1: baseStats({ winsOnGame: 4, currentStreakWins: 2 }) },
      [fifthWin, streak3, marathon],
      {},
    );
    expect(r[0]!.unlockedAchievementIds.sort()).toEqual(
      ["ach-5wins", "ach-marathon", "ach-streak3"].sort(),
    );
  });
});

describe("computeMatchAwards — edge cases", () => {
  it("handles a player with no prior stats (treats as zero)", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "new-user", won: true }]),
      {},
      [],
      {},
    );
    expect(r[0]!.xpDelta).toBeGreaterThan(0);
  });

  it("returns empty array for a match with no players", () => {
    expect(computeMatchAwards(withPlayers([]), {}, [], {})).toEqual([]);
  });

  it("xpDelta equals the sum of xpBreakdown entries", () => {
    const r = computeMatchAwards(
      withPlayers([{ userId: "u1", won: true, liked: true }]),
      { u1: { ...emptyStats("u1"), winsOnGame: 4 } },
      [
        {
          id: "ach",
          triggerExpr: "wins_on_game >= 5",
          rarity: "epic",
        },
      ],
      {},
    );
    const sum = r[0]!.xpBreakdown.reduce((s, b) => s + b.xp, 0);
    expect(r[0]!.xpDelta).toBe(sum);
  });
});
