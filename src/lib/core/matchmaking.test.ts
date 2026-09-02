import { describe, expect, it } from "vitest";
import {
  groupAvailabilities,
  weekdayLabelEs,
  formatHourRange,
  type AvailabilityInput,
} from "./matchmaking.js";

function avail(over: Partial<AvailabilityInput> & Pick<AvailabilityInput, "id" | "player" | "role">): AvailabilityInput {
  return {
    weekday: "sat",
    start_hour: 18,
    end_hour: 22,
    ...over,
  };
}

describe("groupAvailabilities", () => {
  it("returns nothing when there are no hosts", () => {
    const rows = [avail({ id: "1", player: "p1", role: "player" })];
    expect(groupAvailabilities(rows)).toEqual([]);
  });

  it("returns nothing when a host has no compatible players", () => {
    const rows = [avail({ id: "1", player: "h1", role: "host", capacity: 4 })];
    expect(groupAvailabilities(rows)).toEqual([]);
  });

  it("matches one host with one compatible player", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 4 }),
      avail({ id: "2", player: "p1", role: "player" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups).toEqual([
      { host: "h1", weekday: "sat", start_hour: 18, end_hour: 22, players: ["p1"] },
    ]);
  });

  it("matches when overlap is at least 3 hours", () => {
    // host 18-22, player 19-23 -> overlap = min(22,23) - max(18,19) = 3
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 4 }),
      avail({ id: "2", player: "p1", role: "player", start_hour: 19, end_hour: 23 }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups[0]!.players).toEqual(["p1"]);
  });

  it("excludes a player whose overlap is under 3 hours", () => {
    // host 18-22, player 20-22 -> overlap = min(22,22) - max(18,20) = 2
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 4 }),
      avail({ id: "2", player: "p1", role: "player", start_hour: 20, end_hour: 22 }),
    ];
    expect(groupAvailabilities(rows)).toEqual([]);
  });

  it("excludes a player whose range only touches the host's (zero overlap)", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 4 }),
      avail({ id: "2", player: "p1", role: "player", start_hour: 22, end_hour: 24 }),
    ];
    expect(groupAvailabilities(rows)).toEqual([]);
  });

  it("excludes a player whose range is fully disjoint from the host's", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 4 }),
      avail({ id: "2", player: "p1", role: "player", start_hour: 23, end_hour: 24 }),
    ];
    expect(groupAvailabilities(rows)).toEqual([]);
  });

  it("stops assigning once host capacity is reached", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 2 }),
      avail({ id: "2", player: "p1", role: "player" }),
      avail({ id: "3", player: "p2", role: "player" }),
      avail({ id: "4", player: "p3", role: "player" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.players).toHaveLength(2);
  });

  it("excludes a player whose max_group_size would be exceeded", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 10 }),
      avail({ id: "2", player: "p1", role: "player" }), // no cap
      // p2 only wants a group of 2 total (host + 1 player) max.
      avail({ id: "3", player: "p2", role: "player", max_group_size: 2 }),
    ];
    const groups = groupAvailabilities(rows);
    // p1 joins first (group size 2, fine for p2's cap check at that point:
    // adding p2 would make it 3 > 2, so p2 gets excluded).
    expect(groups).toEqual([
      { host: "h1", weekday: "sat", start_hour: 18, end_hour: 22, players: ["p1"] },
    ]);
  });

  it("a player with no max_group_size joins regardless of group size", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 10 }),
      avail({ id: "2", player: "p1", role: "player" }),
      avail({ id: "3", player: "p2", role: "player" }),
      avail({ id: "4", player: "p3", role: "player" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups[0]!.players).toEqual(["p1", "p2", "p3"]);
  });

  it("does not double-assign a player to two hosts the same weekday, and prefers higher-capacity hosts first", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 5 }),
      avail({ id: "2", player: "h2", role: "host", capacity: 1 }),
      avail({ id: "3", player: "p1", role: "player" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.host).toBe("h1"); // higher capacity considered first
    expect(groups[0]!.players).toEqual(["p1"]);
  });

  it("keeps different weekdays independent", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 1, weekday: "sat" }),
      avail({ id: "2", player: "p1", role: "player", weekday: "sat" }),
      avail({ id: "3", player: "h1", role: "host", capacity: 1, weekday: "sun" }),
      avail({ id: "4", player: "p1", role: "player", weekday: "sun" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.weekday).sort()).toEqual(["sat", "sun"]);
  });

  it("a host never gets matched with themself posting as a player the same weekday", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 4 }),
      avail({ id: "2", player: "h1", role: "player" }),
    ];
    expect(groupAvailabilities(rows)).toEqual([]);
  });

  it("treats a missing host capacity as unlimited", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host" }),
      avail({ id: "2", player: "p1", role: "player" }),
      avail({ id: "3", player: "p2", role: "player" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups[0]!.players).toHaveLength(2);
  });
});

describe("weekdayLabelEs", () => {
  it("translates every known value", () => {
    expect(weekdayLabelEs("sat")).toBe("sábado");
  });

  // Generated record types widen this field to include "" (see the
  // comment above weekdayLabelEs in matchmaking.ts) even though it's
  // required and never actually empty at runtime — must not throw.
  it("falls back to the raw value for an empty or unknown string", () => {
    expect(weekdayLabelEs("")).toBe("");
    expect(weekdayLabelEs("nope")).toBe("nope");
  });
});

describe("formatHourRange", () => {
  it("zero-pads and formats a range", () => {
    expect(formatHourRange(18, 23)).toBe("18:00–23:00");
    expect(formatHourRange(9, 12)).toBe("09:00–12:00");
  });

  it("wraps end_hour of 24 to 00", () => {
    expect(formatHourRange(22, 24)).toBe("22:00–00:00");
  });
});
