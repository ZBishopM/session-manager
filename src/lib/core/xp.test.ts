import { describe, expect, it } from "vitest";
import {
  XP_PER_ACTION,
  levelFromXp,
  progressToNextLevel,
  xpForAction,
  xpForLevel,
} from "./xp.js";

describe("xpForAction", () => {
  it.each([
    ["participate_match", 10],
    ["win_match", 15],
    ["rate_game", 2],
    ["host_session", 50],
    ["co_host_session", 30],
    ["add_game", 25],
    ["achievement_common", 10],
    ["achievement_rare", 25],
    ["achievement_epic", 50],
  ] as const)("returns %i xp for action %s", (action, expected) => {
    expect(xpForAction(action)).toBe(expected);
  });

  it("exposes the same table via XP_PER_ACTION", () => {
    expect(XP_PER_ACTION.win_match).toBe(15);
  });
});

describe("xpForLevel", () => {
  it("level 1 requires 0 xp (starting level)", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("level 2 requires 100 xp", () => {
    expect(xpForLevel(2)).toBe(100);
  });

  it("is strictly increasing", () => {
    let prev = -1;
    for (let l = 1; l <= 20; l++) {
      const v = xpForLevel(l);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it("throws for level < 1", () => {
    expect(() => xpForLevel(0)).toThrow();
    expect(() => xpForLevel(-5)).toThrow();
  });
});

describe("levelFromXp", () => {
  it("returns level 1 for 0 xp", () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it("returns level 1 for 99 xp (just under threshold)", () => {
    expect(levelFromXp(99)).toBe(1);
  });

  it("returns level 2 exactly at 100 xp", () => {
    expect(levelFromXp(100)).toBe(2);
  });

  it("clamps negative xp to level 1", () => {
    expect(levelFromXp(-50)).toBe(1);
  });

  it("is consistent with xpForLevel: levelFromXp(xpForLevel(L)) === L", () => {
    for (let l = 1; l <= 15; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l);
    }
  });

  it("progresses slower at higher levels (curve)", () => {
    // Time to go from L to L+1 should strictly increase with L.
    let prevDelta = 0;
    for (let l = 1; l < 10; l++) {
      const delta = xpForLevel(l + 1) - xpForLevel(l);
      expect(delta).toBeGreaterThan(prevDelta);
      prevDelta = delta;
    }
  });
});

describe("progressToNextLevel", () => {
  it("at exact level threshold, ratio is 0", () => {
    const p = progressToNextLevel(100);
    expect(p.level).toBe(2);
    expect(p.into).toBe(0);
    expect(p.ratio).toBe(0);
  });

  it("halfway through a level has ratio ~0.5", () => {
    const base = xpForLevel(3);
    const next = xpForLevel(4);
    const mid = Math.floor((base + next) / 2);
    const p = progressToNextLevel(mid);
    expect(p.level).toBe(3);
    expect(p.ratio).toBeGreaterThan(0.4);
    expect(p.ratio).toBeLessThan(0.6);
  });

  it("needed equals delta between level and next", () => {
    const p = progressToNextLevel(250);
    expect(p.needed).toBe(xpForLevel(p.level + 1) - xpForLevel(p.level));
  });
});
