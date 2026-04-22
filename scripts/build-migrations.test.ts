import { describe, expect, it } from "vitest";
import type { CollectionDef } from "../src/lib/core/schema.js";
import { buildInitMigration } from "./build-migrations.js";

describe("buildInitMigration", () => {
  const minimal: CollectionDef[] = [
    {
      name: "categories",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true, unique: true, max: 30 },
      ],
    },
    {
      name: "games",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true, max: 80 },
        { name: "categories", type: "relation", relationTo: "categories" },
      ],
    },
  ];

  it("produces a deterministic string (no timestamps or random ids)", () => {
    const a = buildInitMigration(minimal);
    const b = buildInitMigration(minimal);
    expect(a).toBe(b);
  });

  it("includes the auto-generated banner", () => {
    const out = buildInitMigration(minimal);
    expect(out).toContain("AUTO-GENERATED");
  });

  it("emits a single migrate() call with up and down", () => {
    const out = buildInitMigration(minimal);
    const matches = out.match(/migrate\(/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(out).toContain("new Collection(data)");
    expect(out).toContain("app.findCollectionByNameOrId(name)");
  });

  it("lists collections in manifest order for creation", () => {
    const out = buildInitMigration(minimal);
    const catIdx = out.indexOf('"name": "categories"');
    const gameIdx = out.indexOf('"name": "games"');
    expect(catIdx).toBeGreaterThan(-1);
    expect(gameIdx).toBeGreaterThan(-1);
    expect(catIdx).toBeLessThan(gameIdx);
  });

  it("lists collections in reverse order for deletion", () => {
    const out = buildInitMigration(minimal);
    const downMatch = out.match(/const names = (\[[^\]]+\])/);
    expect(downMatch).not.toBeNull();
    const names = JSON.parse(downMatch![1]!) as string[];
    expect(names).toEqual(["games", "categories"]);
  });

  it("serializes relation fields with collectionId set to the target's stable id", () => {
    const out = buildInitMigration(minimal);
    // categories collection id is pbc_categories0 (15-char padding)
    expect(out).toContain('"collectionId": "pbc_categories0"');
    // and the target collection's own id field uses the same value
    expect(out).toContain('"id": "pbc_categories0"');
  });

  it("marks auth collections with passwordAuth options", () => {
    const withAuth: CollectionDef[] = [
      {
        name: "users",
        type: "auth",
        fields: [
          { name: "nickname", type: "text", required: true, unique: true },
        ],
      },
    ];
    const out = buildInitMigration(withAuth);
    expect(out).toContain('"passwordAuth"');
    expect(out).toContain('"identityFields"');
  });

  it("throws on an invalid schema", () => {
    const bad: CollectionDef[] = [
      {
        name: "x",
        fields: [{ name: "r", type: "relation" }], // missing relationTo
      },
    ];
    expect(() => buildInitMigration(bad)).toThrow(/Schema validation failed/);
  });

  it("emits select fields with values array", () => {
    const sel: CollectionDef[] = [
      {
        name: "sessions",
        fields: [
          { name: "status", type: "select", required: true, options: ["a", "b"] },
        ],
      },
    ];
    const out = buildInitMigration(sel);
    expect(out).toContain('"values": [');
    expect(out).toContain('"a"');
    expect(out).toContain('"b"');
  });

  it("serializes cascadeDelete on relation fields that ask for it", () => {
    const cascade: CollectionDef[] = [
      { name: "a", fields: [{ name: "n", type: "text" }] },
      {
        name: "b",
        fields: [
          {
            name: "parent",
            type: "relation",
            relationTo: "a",
            cascadeDelete: true,
          },
        ],
      },
    ];
    const out = buildInitMigration(cascade);
    expect(out).toContain('"cascadeDelete": true');
  });

  it("includes indexes SQL verbatim", () => {
    const idx: CollectionDef[] = [
      {
        name: "t",
        fields: [{ name: "x", type: "text" }],
        indexes: ["CREATE UNIQUE INDEX idx_t_x ON t (x)"],
      },
    ];
    const out = buildInitMigration(idx);
    expect(out).toContain("CREATE UNIQUE INDEX idx_t_x ON t (x)");
  });
});
