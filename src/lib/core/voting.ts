/**
 * Vote resolution for picking a game for the next match.
 *
 * Rules (see docs/BUSINESS_RULES.md §4):
 * - Each user casts one vote: a specific game id OR the special "random" marker.
 * - Plurality wins (more votes than any other single option).
 * - If "random" is the sole top option, sample one game from eligibleGameIds.
 * - Any tie between top options (games, or game vs random) → tie, host decides.
 */

export const RANDOM_VOTE = "__random__" as const;
export type RandomVote = typeof RANDOM_VOTE;

export interface Vote {
  userId: string;
  gameId: string | RandomVote;
}

export type VoteResult =
  | { kind: "chosen"; gameId: string }
  | { kind: "random"; gameId: string }
  | { kind: "tie"; candidates: (string | RandomVote)[] }
  | { kind: "no_votes" };

export function resolveVotes(
  votes: readonly Vote[],
  eligibleGameIds: readonly string[],
  rand: () => number = Math.random,
): VoteResult {
  if (votes.length === 0) return { kind: "no_votes" };

  const counts = new Map<string | RandomVote, number>();
  for (const v of votes) {
    counts.set(v.gameId, (counts.get(v.gameId) ?? 0) + 1);
  }

  let max = 0;
  for (const c of counts.values()) {
    if (c > max) max = c;
  }

  const topOptions = [...counts.entries()]
    .filter(([, c]) => c === max)
    .map(([id]) => id);

  if (topOptions.length === 1) {
    const winner = topOptions[0]!;
    if (winner === RANDOM_VOTE) {
      if (eligibleGameIds.length === 0) return { kind: "no_votes" };
      const idx = Math.floor(rand() * eligibleGameIds.length);
      return { kind: "random", gameId: eligibleGameIds[idx]! };
    }
    return { kind: "chosen", gameId: winner };
  }

  return { kind: "tie", candidates: topOptions };
}
