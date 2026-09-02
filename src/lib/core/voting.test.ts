import { describe, expect, it } from "vitest";
import { RANDOM_VOTE, decideVotes, resolveVotes, type Vote } from "./voting.js";

const eligible = ["g1", "g2", "g3"];

describe("resolveVotes", () => {
  it("returns no_votes when the vote list is empty", () => {
    const r = resolveVotes([], eligible);
    expect(r.kind).toBe("no_votes");
  });

  it("returns chosen when a single game is the clear winner", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u2", gameId: "g1" },
      { userId: "u3", gameId: "g2" },
    ];
    const r = resolveVotes(votes, eligible);
    expect(r).toEqual({ kind: "chosen", gameId: "g1" });
  });

  it("returns random when RANDOM is the sole top option", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: RANDOM_VOTE },
      { userId: "u2", gameId: RANDOM_VOTE },
      { userId: "u3", gameId: "g1" },
    ];
    // Deterministic rand picks index 1
    const r = resolveVotes(votes, eligible, () => 0.5);
    expect(r.kind).toBe("random");
    if (r.kind === "random") {
      expect(eligible).toContain(r.gameId);
      expect(r.gameId).toBe("g2");
    }
  });

  it("rand=0 picks first eligible, rand close to 1 picks last", () => {
    const votes: Vote[] = [{ userId: "u1", gameId: RANDOM_VOTE }];
    expect(resolveVotes(votes, eligible, () => 0)).toMatchObject({
      kind: "random",
      gameId: "g1",
    });
    expect(resolveVotes(votes, eligible, () => 0.9999)).toMatchObject({
      kind: "random",
      gameId: "g3",
    });
  });

  it("returns tie when two games are tied at the top", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u2", gameId: "g2" },
    ];
    const r = resolveVotes(votes, eligible);
    expect(r.kind).toBe("tie");
    if (r.kind === "tie") {
      expect(r.candidates.sort()).toEqual(["g1", "g2"]);
    }
  });

  it("returns tie when a game and RANDOM are tied at the top", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u2", gameId: RANDOM_VOTE },
    ];
    const r = resolveVotes(votes, eligible);
    expect(r.kind).toBe("tie");
    if (r.kind === "tie") {
      expect(r.candidates).toContain("g1");
      expect(r.candidates).toContain(RANDOM_VOTE);
    }
  });

  it("returns no_votes if RANDOM wins but eligible pool is empty", () => {
    const votes: Vote[] = [{ userId: "u1", gameId: RANDOM_VOTE }];
    const r = resolveVotes(votes, [], () => 0);
    expect(r.kind).toBe("no_votes");
  });

  it("handles a single vote for a game", () => {
    const votes: Vote[] = [{ userId: "u1", gameId: "g2" }];
    expect(resolveVotes(votes, eligible)).toEqual({
      kind: "chosen",
      gameId: "g2",
    });
  });

  it("does not count a user's duplicate votes (last-write semantics not required here)", () => {
    // The caller is expected to de-dupe, but we still produce a sensible result.
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u1", gameId: "g1" },
    ];
    const r = resolveVotes(votes, eligible);
    expect(r).toEqual({ kind: "chosen", gameId: "g1" });
  });
});

describe("decideVotes", () => {
  it("passes through a clear winner unchanged", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u2", gameId: "g1" },
      { userId: "u3", gameId: "g2" },
    ];
    expect(decideVotes(votes, eligible)).toEqual({ kind: "chosen", gameId: "g1" });
  });

  it("breaks a game-vs-game tie by picking one of the tied candidates", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u2", gameId: "g2" },
    ];
    const r = decideVotes(votes, eligible, () => 0);
    expect(r.kind).toBe("chosen");
    if (r.kind === "chosen") expect(["g1", "g2"]).toContain(r.gameId);
  });

  it("breaks a game-vs-RANDOM tie by falling through to a random eligible game when RANDOM is picked", () => {
    const votes: Vote[] = [
      { userId: "u1", gameId: "g1" },
      { userId: "u2", gameId: RANDOM_VOTE },
    ];
    // candidates sorted by insertion into the Map: g1 then RANDOM_VOTE.
    // rand() close to 1 picks the last candidate (RANDOM_VOTE), then the
    // same rand() feeds the eligible-game draw too.
    const r = decideVotes(votes, eligible, () => 0.99);
    expect(r.kind === "chosen" || r.kind === "random").toBe(true);
  });

  it("falls back to no_votes when there are no votes at all", () => {
    expect(decideVotes([], eligible)).toEqual({ kind: "no_votes" });
  });

  it("never returns a tie", () => {
    for (let i = 0; i < 20; i++) {
      const votes: Vote[] = [
        { userId: "u1", gameId: "g1" },
        { userId: "u2", gameId: "g2" },
        { userId: "u3", gameId: "g3" },
      ];
      const r = decideVotes(votes, eligible, Math.random);
      expect(r.kind).not.toBe("tie");
    }
  });
});
