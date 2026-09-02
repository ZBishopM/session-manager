import { describe, expect, it } from "vitest";
import {
  groupAvailabilities,
  weekdayLabelEs,
  timeSlotLabelEs,
  type AvailabilityInput,
} from "./matchmaking.js";

function avail(over: Partial<AvailabilityInput> & Pick<AvailabilityInput, "id" | "player" | "role">): AvailabilityInput {
  return {
    weekday: "sat",
    time_slot: "afternoon",
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
      { host: "h1", weekday: "sat", time_slot: "afternoon", players: ["p1"] },
    ]);
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
      { host: "h1", weekday: "sat", time_slot: "afternoon", players: ["p1"] },
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

  it("does not double-assign a player to two hosts in the same slot, and prefers higher-capacity hosts first", () => {
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

  it("keeps different weekday/time_slot combinations independent", () => {
    const rows = [
      avail({ id: "1", player: "h1", role: "host", capacity: 1, weekday: "sat", time_slot: "afternoon" }),
      avail({ id: "2", player: "p1", role: "player", weekday: "sat", time_slot: "afternoon" }),
      avail({ id: "3", player: "h1", role: "host", capacity: 1, weekday: "sun", time_slot: "evening" }),
      avail({ id: "4", player: "p1", role: "player", weekday: "sun", time_slot: "evening" }),
    ];
    const groups = groupAvailabilities(rows);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.time_slot).sort()).toEqual(["afternoon", "evening"]);
  });

  it("a host never gets matched with themself posting as a player in the same slot", () => {
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

describe("weekdayLabelEs / timeSlotLabelEs", () => {
  it("translates every known value", () => {
    expect(weekdayLabelEs("sat")).toBe("sábado");
    expect(timeSlotLabelEs("night")).toBe("madrugada");
  });

  // Generated record types widen these fields to include "" (see the
  // comment above weekdayLabelEs/timeSlotLabelEs in matchmaking.ts) even
  // though they're required and never actually empty at runtime — these
  // must not throw on that case.
  it("falls back to the raw value for an empty or unknown string", () => {
    expect(weekdayLabelEs("")).toBe("");
    expect(timeSlotLabelEs("")).toBe("");
    expect(weekdayLabelEs("nope")).toBe("nope");
  });
});
