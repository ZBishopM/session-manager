/**
 * Pure computation of the side-effects triggered by a match ending:
 *   - XP delta per player (participation, win, rating, achievement unlocks).
 *   - Which achievements each player just unlocked.
 *
 * Kept dependency-free so the PocketBase hook that runs after a co-host
 * marks a match "done" can feed its DB queries in and write the results
 * out without duplicating this logic.
 */

import { evaluateTrigger } from "./achievements.js";
import { type XpAction, xpForAction } from "./xp.js";

export type Rating = "like" | "dislike" | null | undefined | "";

export interface MatchPlayerOutcome {
  userId: string;
  won: boolean;
  /** Empty string / null / undefined when not rated. */
  rating?: Rating;
}

export interface MatchOutcome {
  matchId: string;
  gameId: string;
  durationSeconds: number;
  players: readonly MatchPlayerOutcome[];
}

/** Cumulative stats *before* the match, per user. */
export interface UserStats {
  userId: string;
  totalWins: number;
  winsOnGame: number;
  lossesOnGame: number;
  currentStreakWins: number;
  currentStreakLosses: number;
}

export function emptyStats(userId: string): UserStats {
  return {
    userId,
    totalWins: 0,
    winsOnGame: 0,
    lossesOnGame: 0,
    currentStreakWins: 0,
    currentStreakLosses: 0,
  };
}

export interface AchievementDef {
  id: string;
  triggerExpr: string;
  rarity: "common" | "rare" | "epic";
}

export interface XpLine {
  action: XpAction;
  xp: number;
}

export interface AwardResult {
  userId: string;
  xpDelta: number;
  xpBreakdown: XpLine[];
  unlockedAchievementIds: string[];
}

const RARITY_TO_ACTION: Record<AchievementDef["rarity"], XpAction> = {
  common: "achievement_common",
  rare: "achievement_rare",
  epic: "achievement_epic",
};

export function computeMatchAwards(
  outcome: MatchOutcome,
  statsByUser: Readonly<Record<string, UserStats>>,
  achievementsForGame: readonly AchievementDef[],
  alreadyUnlocked: Readonly<Record<string, ReadonlySet<string>>>,
): AwardResult[] {
  const results: AwardResult[] = [];

  for (const player of outcome.players) {
    const lines: XpLine[] = [];

    lines.push({
      action: "participate_match",
      xp: xpForAction("participate_match"),
    });
    if (player.won) {
      lines.push({ action: "win_match", xp: xpForAction("win_match") });
    }
    if (player.rating === "like" || player.rating === "dislike") {
      lines.push({ action: "rate_game", xp: xpForAction("rate_game") });
    }

    const prev = statsByUser[player.userId] ?? emptyStats(player.userId);
    const postStats = advanceStats(prev, player.won, outcome.durationSeconds);
    const existing = alreadyUnlocked[player.userId] ?? new Set<string>();

    const unlocked: string[] = [];
    for (const ach of achievementsForGame) {
      if (existing.has(ach.id)) continue;
      if (evaluateTrigger(ach.triggerExpr, postStats)) {
        unlocked.push(ach.id);
        const action = RARITY_TO_ACTION[ach.rarity];
        lines.push({ action, xp: xpForAction(action) });
      }
    }

    const xpDelta = lines.reduce((sum, line) => sum + line.xp, 0);
    results.push({
      userId: player.userId,
      xpDelta,
      xpBreakdown: lines,
      unlockedAchievementIds: unlocked,
    });
  }

  return results;
}

/**
 * Project the `evaluateTrigger` variable space from a user's pre-match stats
 * plus the outcome of this match. Keeping the property names snake_case
 * matches the surface we document for AI-generated trigger expressions.
 */
function advanceStats(
  prev: UserStats,
  won: boolean,
  durationSeconds: number,
): Record<string, number> {
  return {
    total_wins: prev.totalWins + (won ? 1 : 0),
    wins_on_game: prev.winsOnGame + (won ? 1 : 0),
    losses_on_game: prev.lossesOnGame + (won ? 0 : 1),
    current_streak_wins: won ? prev.currentStreakWins + 1 : 0,
    current_streak_losses: won ? 0 : prev.currentStreakLosses + 1,
    match_duration_seconds: durationSeconds,
    match_duration_minutes: durationSeconds / 60,
  };
}
