import { describe, expect, it } from "vitest";
import { evaluateTrigger } from "./achievements.js";

describe("evaluateTrigger", () => {
  describe("simple comparisons", () => {
    it("wins_on_game >= 5 is true at 5", () => {
      expect(evaluateTrigger("wins_on_game >= 5", { wins_on_game: 5 })).toBe(true);
    });

    it("wins_on_game >= 5 is false at 4", () => {
      expect(evaluateTrigger("wins_on_game >= 5", { wins_on_game: 4 })).toBe(false);
    });

    it("unknown variable defaults to 0", () => {
      expect(evaluateTrigger("unknown_var >= 1", {})).toBe(false);
      expect(evaluateTrigger("unknown_var <= 0", {})).toBe(true);
    });

    it.each([
      [">=", 5, 5, true],
      [">=", 4, 5, false],
      [">", 5, 5, false],
      [">", 6, 5, true],
      ["<=", 5, 5, true],
      ["<=", 6, 5, false],
      ["<", 5, 5, false],
      ["<", 4, 5, true],
      ["==", 5, 5, true],
      ["==", 4, 5, false],
      ["!=", 5, 5, false],
      ["!=", 4, 5, true],
    ] as const)("%s: %i op %i = %s", (op, a, b, expected) => {
      expect(evaluateTrigger(`x ${op} ${b}`, { x: a })).toBe(expected);
    });
  });

  describe("boolean composition", () => {
    it("&& requires both sides true", () => {
      const stats = { wins: 5, losses: 3 };
      expect(evaluateTrigger("wins >= 5 && losses >= 3", stats)).toBe(true);
      expect(evaluateTrigger("wins >= 6 && losses >= 3", stats)).toBe(false);
    });

    it("|| requires either side true", () => {
      const stats = { wins: 0, losses: 10 };
      expect(evaluateTrigger("wins >= 1 || losses >= 10", stats)).toBe(true);
      expect(evaluateTrigger("wins >= 1 || losses >= 99", stats)).toBe(false);
    });

    it("respects parentheses", () => {
      const stats = { a: 1, b: 0, c: 1 };
      // Without parens: a >= 1 && b >= 1 || c >= 1 = false && true => evaluated left-to-right
      // With parens: (a >= 1) || (b >= 1 && c >= 1) = true
      expect(evaluateTrigger("(a >= 1) || (b >= 1 && c >= 1)", stats)).toBe(true);
      expect(evaluateTrigger("(a >= 1 && b >= 1) || c >= 1", stats)).toBe(true);
      expect(evaluateTrigger("a >= 1 && (b >= 1 || c >= 1)", stats)).toBe(true);
      expect(evaluateTrigger("a >= 2 && (b >= 1 || c >= 1)", stats)).toBe(false);
    });

    it("handles deeply nested expressions", () => {
      expect(evaluateTrigger("((1 >= 1))", {})).toBe(true);
      expect(evaluateTrigger("((1 >= 2))", {})).toBe(false);
    });
  });

  describe("robustness", () => {
    it("returns false on empty string", () => {
      expect(evaluateTrigger("", {})).toBe(false);
    });

    it("returns false on syntactically invalid input", () => {
      expect(evaluateTrigger(">>>", {})).toBe(false);
      expect(evaluateTrigger("wins >=", {})).toBe(false);
      expect(evaluateTrigger("(wins >= 5", {})).toBe(false);
    });

    it("rejects function-call-like syntax (no execution surface)", () => {
      expect(evaluateTrigger("process.exit(1)", {})).toBe(false);
      expect(evaluateTrigger("wins.toString() >= 5", {})).toBe(false);
    });

    it("rejects assignment-like syntax", () => {
      expect(evaluateTrigger("wins = 5", {})).toBe(false);
    });

    it("ignores whitespace liberally", () => {
      expect(
        evaluateTrigger("   wins   >=   5   ", { wins: 6 }),
      ).toBe(true);
    });

    it("handles decimal numbers", () => {
      expect(evaluateTrigger("ratio >= 0.5", { ratio: 0.75 })).toBe(true);
      expect(evaluateTrigger("ratio >= 0.5", { ratio: 0.25 })).toBe(false);
    });
  });

  describe("realistic board-game triggers", () => {
    it("win streak trigger", () => {
      const expr = "current_streak_wins >= 3";
      expect(evaluateTrigger(expr, { current_streak_wins: 3 })).toBe(true);
      expect(evaluateTrigger(expr, { current_streak_wins: 2 })).toBe(false);
    });

    it("marathon match trigger", () => {
      const expr = "match_duration_minutes >= 120";
      expect(evaluateTrigger(expr, { match_duration_minutes: 145 })).toBe(true);
    });

    it("loyal-loser combo", () => {
      const expr = "losses_on_game >= 10 && wins_on_game == 0";
      expect(
        evaluateTrigger(expr, { losses_on_game: 10, wins_on_game: 0 }),
      ).toBe(true);
      expect(
        evaluateTrigger(expr, { losses_on_game: 10, wins_on_game: 1 }),
      ).toBe(false);
    });
  });
});
