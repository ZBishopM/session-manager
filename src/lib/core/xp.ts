/**
 * XP and leveling for players, hosts and co-hosts.
 *
 * Curve: xp needed to go from level L to L+1 is floor(100 * L^1.5).
 * Cumulative xp to reach level L is the sum of those deltas from 1 to L-1.
 * Level 1 is the starting level and requires 0 xp.
 */

export const XP_PER_ACTION = {
  participate_match: 10,
  win_match: 15,
  rate_game: 2,
  host_session: 50,
  co_host_session: 30,
  add_game: 25,
  achievement_common: 10,
  achievement_rare: 25,
  achievement_epic: 50,
} as const;

export type XpAction = keyof typeof XP_PER_ACTION;

export function xpForAction(action: XpAction): number {
  return XP_PER_ACTION[action];
}

export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`level must be an integer >= 1, got ${level}`);
  }
  let total = 0;
  for (let k = 1; k < level; k++) {
    total += Math.floor(100 * Math.pow(k, 1.5));
  }
  return total;
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) {
    lvl++;
  }
  return lvl;
}

export interface LevelProgress {
  level: number;
  into: number;
  needed: number;
  ratio: number;
}

export function progressToNextLevel(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = xp - base;
  const needed = next - base;
  return { level, into, needed, ratio: into / needed };
}
