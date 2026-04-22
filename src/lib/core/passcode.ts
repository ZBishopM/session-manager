/**
 * Passcode helpers.
 *
 * The app supports two input modes that both produce a canonical string:
 *   - Numeric passcode (4 digits typed on a keypad).
 *   - Tactile pattern on a 3x3 grid (Android-style), canonicalized by joining
 *     the sequence of point indices (0-8). A pattern is strictly longer than
 *     4 because the point space (9 options) is smaller than 10 digits.
 *
 * The resulting string is what the server sees and hashes (Argon2id, done in
 * the backend). This module only handles validation and canonicalization.
 */

export const MIN_PATTERN_LENGTH = 4;
export const MAX_PATTERN_LENGTH = 9;

export function canonicalizePattern(points: readonly number[]): string {
  if (points.length < MIN_PATTERN_LENGTH) {
    throw new Error(
      `Pattern must have at least ${MIN_PATTERN_LENGTH} points`,
    );
  }
  if (points.length > MAX_PATTERN_LENGTH) {
    throw new Error(
      `Pattern cannot have more than ${MAX_PATTERN_LENGTH} points`,
    );
  }
  const seen = new Set<number>();
  for (const p of points) {
    if (!Number.isInteger(p) || p < 0 || p > 8) {
      throw new Error(`Pattern point out of range: ${p}`);
    }
    if (seen.has(p)) {
      throw new Error("Pattern points must be unique");
    }
    seen.add(p);
  }
  return points.join("");
}

export function isValidPasscode(value: string): boolean {
  return typeof value === "string" && /^\d{4}$/.test(value);
}
