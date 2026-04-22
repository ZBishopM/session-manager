// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../src/lib/core/schema.js";
import { api, expectOk, startPocketBase, type Harness } from "./harness.js";

describe("PocketBase applies the generated migration", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startPocketBase();
  }, 60_000);

  afterAll(async () => {
    if (h) await h.stop();
  });

  it("creates every collection declared in the manifest", async () => {
    const body = (await expectOk(
      await api(h).get("/api/collections?perPage=200"),
      "list collections",
    )) as { items: Array<{ name: string; type: string }> };

    const present = new Set(body.items.map((c) => c.name));
    for (const expected of COLLECTIONS) {
      expect(present.has(expected.name), `missing collection ${expected.name}`).toBe(true);
    }
  });

  it("players collection is typed as auth", async () => {
    const players = (await expectOk(
      await api(h).get("/api/collections/players"),
      "get players collection",
    )) as { type: string; fields: Array<{ name: string }> };
    expect(players.type).toBe("auth");
    const fields = players.fields.map((f) => f.name);
    expect(fields).toContain("nickname");
    expect(fields).toContain("xp");
    expect(fields).toContain("level");
  });

  it("games has required business fields", async () => {
    const games = (await expectOk(
      await api(h).get("/api/collections/games"),
      "get games collection",
    )) as { fields: Array<{ name: string; required?: boolean }> };
    const byName = new Map(games.fields.map((f) => [f.name, f]));
    for (const name of [
      "name",
      "min_players",
      "max_players",
      "categories",
      "owned_by",
      "created_by",
    ]) {
      expect(byName.has(name), `games.${name} missing`).toBe(true);
    }
  });

  it("cascade-delete relations are preserved through the migration", async () => {
    const children = ["session_participants", "matches", "match_players", "votes"];
    for (const name of children) {
      const coll = (await expectOk(
        await api(h).get(`/api/collections/${name}`),
        `get ${name}`,
      )) as { fields: Array<{ name: string; cascadeDelete?: boolean; type: string }> };
      const hasCascade = coll.fields.some(
        (f) => f.type === "relation" && f.cascadeDelete === true,
      );
      expect(hasCascade, `${name} should declare at least one cascade-delete relation`).toBe(true);
    }
  });
});
