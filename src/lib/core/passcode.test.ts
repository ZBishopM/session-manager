import { describe, expect, it } from "vitest";
import {
  canonicalizePattern,
  isValidPasscode,
  MAX_PATTERN_LENGTH,
  MIN_PATTERN_LENGTH,
} from "./passcode.js";

describe("canonicalizePattern", () => {
  it("joins valid 4-point pattern into digit string", () => {
    expect(canonicalizePattern([0, 1, 2, 5])).toBe("0125");
  });

  it("accepts up to 9 unique points", () => {
    expect(canonicalizePattern([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe("012345678");
  });

  it("rejects patterns shorter than MIN_PATTERN_LENGTH", () => {
    expect(() => canonicalizePattern([0, 1, 2])).toThrow(/at least/i);
  });

  it("rejects patterns longer than MAX_PATTERN_LENGTH", () => {
    expect(() => canonicalizePattern([0, 1, 2, 3, 4, 5, 6, 7, 8, 0])).toThrow(
      /more than/i,
    );
  });

  it("rejects duplicate points", () => {
    expect(() => canonicalizePattern([0, 1, 2, 1])).toThrow(/unique/i);
  });

  it("rejects out-of-range points", () => {
    expect(() => canonicalizePattern([0, 1, 2, 9])).toThrow(/range/i);
    expect(() => canonicalizePattern([-1, 1, 2, 3])).toThrow(/range/i);
    expect(() => canonicalizePattern([0, 1, 2, 3.5])).toThrow(/range/i);
  });

  it("constants are consistent", () => {
    expect(MIN_PATTERN_LENGTH).toBeLessThanOrEqual(MAX_PATTERN_LENGTH);
    expect(MIN_PATTERN_LENGTH).toBeGreaterThanOrEqual(4);
  });
});

describe("isValidPasscode", () => {
  it("accepts exactly 4 digits", () => {
    expect(isValidPasscode("1234")).toBe(true);
    expect(isValidPasscode("0000")).toBe(true);
    expect(isValidPasscode("9999")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidPasscode("")).toBe(false);
    expect(isValidPasscode("123")).toBe(false);
    expect(isValidPasscode("12345")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(isValidPasscode("abcd")).toBe(false);
    expect(isValidPasscode("12a4")).toBe(false);
    expect(isValidPasscode("12 4")).toBe(false);
    expect(isValidPasscode("12.4")).toBe(false);
  });

  it("rejects non-string inputs via type (compile-time) but handles gracefully at runtime", () => {
    // @ts-expect-error intentional: ensuring runtime safety of the guard
    expect(isValidPasscode(1234)).toBe(false);
    // @ts-expect-error intentional
    expect(isValidPasscode(null)).toBe(false);
    // @ts-expect-error intentional
    expect(isValidPasscode(undefined)).toBe(false);
  });
});
