// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CollectionDef } from "../src/lib/core/schema.js";
import { buildRecordsModule } from "./build-types.js";

describe("buildRecordsModule", () => {
  const minimal: CollectionDef[] = [
    {
      name: "categories",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true, unique: true, max: 30 },
        { name: "icon", type: "text", max: 20 },
      ],
    },
    {
      name: "players",
      type: "auth",
      fields: [
        { name: "nickname", type: "text", required: true, unique: true },
        { name: "xp", type: "number" },
        { name: "level", type: "number", required: true },
        { name: "favorite_categories", type: "relation", relationTo: "categories" },
      ],
    },
    {
      name: "match_players",
      type: "base",
      fields: [
        { name: "match", type: "relation", relationTo: "players", maxSelect: 1, required: true },
        { name: "won", type: "bool" },
        {
          name: "rating",
          type: "select",
          maxSelect: 1,
          options: ["like", "dislike"],
        },
      ],
    },
  ];

  it("output is deterministic", () => {
    expect(buildRecordsModule(minimal)).toBe(buildRecordsModule(minimal));
  });

  it("emits a BaseRecord interface", () => {
    const out = buildRecordsModule(minimal);
    expect(out).toContain("export interface BaseRecord");
    expect(out).toContain("collectionId: string");
  });

  it("emits a PascalCased interface per collection", () => {
    const out = buildRecordsModule(minimal);
    expect(out).toContain("export interface CategoriesRecord extends BaseRecord");
    expect(out).toContain("export interface PlayersRecord extends BaseRecord");
    expect(out).toContain("export interface MatchPlayersRecord extends BaseRecord");
  });

  it("auth collection adds email/verified/emailVisibility", () => {
    const out = buildRecordsModule(minimal);
    const start = out.indexOf("PlayersRecord");
    const end = out.indexOf("}", start);
    const block = out.slice(start, end);
    expect(block).toContain("email?: string");
    expect(block).toContain("verified?: boolean");
  });

  it("required text fields are non-optional", () => {
    const out = buildRecordsModule(minimal);
    expect(out).toMatch(/name:\s*string/); // required
    expect(out).toMatch(/icon\?\:\s*string/); // optional (no required)
  });

  it("select with options becomes a string union", () => {
    const out = buildRecordsModule(minimal);
    expect(out).toMatch(/rating\?\:\s*"like" \| "dislike" \| ""/);
  });

  it("single-select relations are string, multi are string[]", () => {
    const out = buildRecordsModule(minimal);
    expect(out).toMatch(/match:\s*string;/); // maxSelect: 1
    expect(out).toMatch(/favorite_categories\?\:\s*string\[\]/);
  });

  it("emits a CollectionRecordMap mapping name -> interface", () => {
    const out = buildRecordsModule(minimal);
    expect(out).toContain("export interface CollectionRecordMap");
    expect(out).toContain("categories: CategoriesRecord");
    expect(out).toContain("players: PlayersRecord");
    expect(out).toContain("match_players: MatchPlayersRecord");
  });

  it("exports CollectionName as the keyof the map", () => {
    expect(buildRecordsModule(minimal)).toContain(
      "export type CollectionName = keyof CollectionRecordMap",
    );
  });
});
