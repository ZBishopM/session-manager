import { describe, expect, it } from "vitest";
import {
  AUTH_OPTIONS,
  COLLECTIONS,
  type CollectionDef,
  validateSchema,
} from "./schema.js";

describe("canonical COLLECTIONS schema", () => {
  it("passes all invariant checks", () => {
    expect(validateSchema(COLLECTIONS)).toEqual([]);
  });

  it("contains every collection referenced in the architecture doc", () => {
    const expected = [
      "categories",
      "players",
      "games",
      "achievements",
      "sessions",
      "session_participants",
      "matches",
      "match_players",
      "votes",
      "player_achievements",
    ];
    const actual = COLLECTIONS.map((c) => c.name);
    expect(actual).toEqual(expect.arrayContaining(expected));
  });

  it("defines exactly one auth collection (users)", () => {
    const authCollections = COLLECTIONS.filter((c) => c.type === "auth");
    expect(authCollections).toHaveLength(1);
    expect(authCollections[0]!.name).toBe("players");
  });

  it("users auth collection has nickname as unique identity field", () => {
    const users = COLLECTIONS.find((c) => c.name === "players")!;
    const nickname = users.fields.find((f) => f.name === "nickname")!;
    expect(nickname.unique).toBe(true);
    expect(nickname.required).toBe(true);
    expect(nickname.type).toBe("text");
  });

  it("AUTH_OPTIONS enables 4-digit passcode auth via the nickname identity", () => {
    expect(AUTH_OPTIONS.minPasswordLength).toBe(4);
    expect(AUTH_OPTIONS.identityFields).toContain("nickname");
  });

  it("every collection that stores mutations restricts write rules", () => {
    const mutableWithRules = ["games", "sessions"];
    for (const name of mutableWithRules) {
      const c = COLLECTIONS.find((x) => x.name === name)!;
      expect(c.createRule).not.toBeNull();
      expect(c.updateRule).not.toBeNull();
    }
  });

  it("cascade-deletes children when parent session/match/game dies", () => {
    const shouldCascade: Array<[string, string]> = [
      ["session_participants", "session"],
      ["matches", "session"],
      ["match_players", "match"],
      ["votes", "match"],
      ["achievements", "game"],
      ["player_achievements", "player"],
      ["player_achievements", "achievement"],
    ];
    for (const [collName, fieldName] of shouldCascade) {
      const coll = COLLECTIONS.find((c) => c.name === collName)!;
      const field = coll.fields.find((f) => f.name === fieldName)!;
      expect(
        field.cascadeDelete,
        `${collName}.${fieldName} should cascade`,
      ).toBe(true);
    }
  });
});

describe("validateSchema", () => {
  const base: CollectionDef = {
    name: "t",
    type: "base",
    fields: [{ name: "x", type: "text" }],
  };

  it("flags duplicate collection names", () => {
    const errs = validateSchema([base, base]);
    expect(errs.some((e) => /duplicate collection/.test(e.message))).toBe(true);
  });

  it("flags collections with no fields", () => {
    const errs = validateSchema([{ ...base, fields: [] }]);
    expect(errs.some((e) => /no fields/.test(e.message))).toBe(true);
  });

  it("flags duplicate field names", () => {
    const errs = validateSchema([
      {
        ...base,
        fields: [
          { name: "x", type: "text" },
          { name: "x", type: "number" },
        ],
      },
    ]);
    expect(errs.some((e) => /duplicate field/.test(e.message))).toBe(true);
  });

  it("flags non-snake-case field names", () => {
    const errs = validateSchema([
      { ...base, fields: [{ name: "camelCase", type: "text" }] },
    ]);
    expect(errs.some((e) => /snake_case/.test(e.message))).toBe(true);
  });

  it("flags select fields missing options", () => {
    const errs = validateSchema([
      { ...base, fields: [{ name: "s", type: "select" }] },
    ]);
    expect(errs.some((e) => /select field/.test(e.message))).toBe(true);
  });

  it("flags relation fields without relationTo", () => {
    const errs = validateSchema([
      { ...base, fields: [{ name: "r", type: "relation" }] },
    ]);
    expect(errs.some((e) => /relationTo/.test(e.message))).toBe(true);
  });

  it("flags relation pointing to collection not yet defined", () => {
    const errs = validateSchema([
      {
        name: "a",
        fields: [{ name: "r", type: "relation", relationTo: "b" }],
      },
      { name: "b", fields: [{ name: "x", type: "text" }] },
    ]);
    expect(
      errs.some((e) => /must reference a collection defined earlier/.test(e.message)),
    ).toBe(true);
  });

  it("flags min > max on a field", () => {
    const errs = validateSchema([
      { ...base, fields: [{ name: "x", type: "text", min: 10, max: 5 }] },
    ]);
    expect(errs.some((e) => /min.*max/.test(e.message))).toBe(true);
  });

  it("flags index SQL that targets a different table", () => {
    const errs = validateSchema([
      {
        ...base,
        indexes: ["CREATE UNIQUE INDEX idx_wrong ON other_table (x)"],
      },
    ]);
    expect(errs.some((e) => /should target table/.test(e.message))).toBe(true);
  });

  it("accepts a well-formed minimal manifest", () => {
    expect(validateSchema([base])).toEqual([]);
  });
});
