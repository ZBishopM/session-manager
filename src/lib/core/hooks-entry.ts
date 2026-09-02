/**
 * Entry point for the esbuild bundle consumed by PocketBase hooks.
 *
 * Whatever this file re-exports becomes the public surface of
 * `pb_hooks/_core.js`. Keep it narrow: hooks that need extra functions
 * should be extended deliberately so we notice when the contract grows.
 */

export { computeMatchAwards, emptyStats } from "./awards.js";
export { evaluateTrigger } from "./achievements.js";
export {
  ACHIEVEMENTS_MODEL_DEFAULT,
  buildGeminiRequest,
  buildPrompt,
  extractGeminiText,
  parseAchievements,
} from "./achievement-generator.js";
export { resolveVotes, decideVotes, RANDOM_VOTE } from "./voting.js";
export { levelFromXp, progressToNextLevel, xpForAction } from "./xp.js";
export { groupAvailabilities, formatHourRange } from "./matchmaking.js";
export { buildDiscordMessage, buildInviteEmail, generateInviteToken } from "./notify.js";
