/**
 * Generates per-game achievements with Claude.
 *
 * All network IO lives in the PocketBase hook (Goja side); this module
 * provides the three pure building blocks:
 *   - buildPrompt:  system + user text (system is constant & cacheable)
 *   - buildClaudeRequest: serialized Messages API body
 *   - extractClaudeText + parseAchievements: pull the JSON list out of
 *     the response and drop any entries that wouldn't evaluate under
 *     our trigger DSL.
 *
 * Splitting it this way means the hook is a few lines of glue and every
 * behavior is covered by fast, offline unit tests.
 */

import { evaluateTrigger } from "./achievements.js";

export const ACHIEVEMENTS_MODEL_DEFAULT = "gemini-2.5-flash";
const MAX_TOKENS = 2048;
const MAX_ACHIEVEMENTS = 10;

export interface GameInfo {
  name: string;
  description?: string;
  categories?: readonly string[];
  minPlayers: number;
  maxPlayers: number;
}

export interface GeneratedAchievement {
  title: string;
  description: string;
  triggerExpr: string;
  rarity: "common" | "rare" | "epic";
}

export interface GeminiPrompt {
  system: string;
  user: string;
}

const SYSTEM_PROMPT = `You generate personalized board-game achievements.

Output strict JSON: an array of 6 objects, each with:
  - "title": string, 1-80 chars, punchy and game-flavored
  - "description": string, 1-300 chars, include a pun or in-joke about the game
  - "triggerExpr": a safe expression using only these variables:
      total_wins, wins_on_game, losses_on_game,
      current_streak_wins, current_streak_losses,
      match_duration_seconds, match_duration_minutes
    and these operators: >=, <=, >, <, ==, !=, &&, ||, ( )
    No function calls, no property access, no string literals.
  - "rarity": one of "common", "rare", "epic"

Cover these buckets across the 6 outputs:
  1. First win (common)
  2. Five wins on this game (common)
  3. Twenty-five wins (rare)
  4. First loss, with a consoling pun (common)
  5. A win streak (>= 3) (rare)
  6. An edge case specific to the game (epic) — e.g. a very long match
     (match_duration_minutes >= <reasonable-for-this-game>) or a
     loyal-loser combo (losses_on_game >= 10 && wins_on_game == 0).

Return ONLY the JSON array. No prose, no markdown.`;

export function buildPrompt(game: GameInfo): GeminiPrompt {
  const cats = game.categories?.length
    ? `Categories: ${game.categories.join(", ")}.`
    : "Categories: unspecified.";
  const desc = game.description?.trim()
    ? `Description: ${game.description.trim()}`
    : "";
  const user = [
    `Game: ${game.name}`,
    `Players: ${game.minPlayers}-${game.maxPlayers}`,
    cats,
    desc,
  ]
    .filter(Boolean)
    .join("\n");
  return { system: SYSTEM_PROMPT, user };
}

export interface GeminiRequestOptions {
  model?: string;
  maxTokens?: number;
}

export function buildGeminiRequest(
  prompt: GeminiPrompt,
  opts: GeminiRequestOptions = {},
): string {
  const body = {
    systemInstruction: {
      parts: [{ text: prompt.system }]
    },
    contents: [
      { parts: [{ text: prompt.user }] }
    ],
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? MAX_TOKENS,
      responseMimeType: "application/json"
    }
  };
  return JSON.stringify(body);
}

export function extractGeminiText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const candidates = (response as any).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return "";
  return parts[0]?.text || "";
}

const RARITIES = new Set(["common", "rare", "epic"]);
const LIMITS = {
  title: { min: 1, max: 80 },
  description: { min: 1, max: 300 },
  triggerExpr: { min: 1, max: 500 },
} as const;

export function parseAchievements(raw: string): GeneratedAchievement[] {
  const json = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: GeneratedAchievement[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (out.length >= MAX_ACHIEVEMENTS) break;
    const normalized = normalizeAchievement(item);
    if (!normalized) continue;
    if (seen.has(normalized.triggerExpr)) continue;
    seen.add(normalized.triggerExpr);
    out.push(normalized);
  }
  return out;
}

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match && match[1]) return match[1].trim();
  return trimmed;
}

function normalizeAchievement(item: unknown): GeneratedAchievement | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const title = asString(obj.title, LIMITS.title.min, LIMITS.title.max);
  const description = asString(
    obj.description,
    LIMITS.description.min,
    LIMITS.description.max,
  );
  const triggerExpr = asString(
    obj.triggerExpr,
    LIMITS.triggerExpr.min,
    LIMITS.triggerExpr.max,
  );
  const rarity = typeof obj.rarity === "string" ? obj.rarity : "";
  if (!title || !description || !triggerExpr || !RARITIES.has(rarity)) {
    return null;
  }
  // Every generated trigger must be parseable by our DSL with zeroed stats;
  // otherwise the achievement could never unlock safely.
  if (!exprParses(triggerExpr)) return null;
  return {
    title,
    description,
    triggerExpr,
    rarity: rarity as GeneratedAchievement["rarity"],
  };
}

function asString(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

function exprParses(expr: string): boolean {
  // evaluateTrigger returns false for malformed input — but false is also
  // valid for correctly-parsed-but-unmet expressions. Distinguish by
  // evaluating against impossibly high stats: if the expr parses, it can
  // be either true or false; if it throws or uses disallowed tokens,
  // it's always false regardless of stats.
  const huge: Record<string, number> = {
    total_wins: 1e9,
    wins_on_game: 1e9,
    losses_on_game: 1e9,
    current_streak_wins: 1e9,
    current_streak_losses: 1e9,
    match_duration_seconds: 1e9,
    match_duration_minutes: 1e9,
  };
  const zero: Record<string, number> = Object.fromEntries(
    Object.keys(huge).map((k) => [k, 0]),
  );
  // A well-formed expression will be true for at least one of huge/zero
  // unless it's a degenerate tautology like `0 == 0`. Require "varies":
  // if it evaluates identically for both extremes AND that result is
  // false, treat as unparseable (likely a bogus expression).
  const a = evaluateTrigger(expr, huge);
  const b = evaluateTrigger(expr, zero);
  return a || b;
}
