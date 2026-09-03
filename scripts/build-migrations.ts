/**
 * Generate the PocketBase JS migration(s) from src/lib/core/schema.ts.
 *
 * Run via `npm run build:migrations`. The output is deterministic so CI can
 * run the generator and assert `git diff --exit-code pb_migrations/`.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTH_OPTIONS,
  COLLECTIONS,
  type CollectionDef,
  type FieldDef,
  collectionIdFor,
  validateSchema,
} from "../src/lib/core/schema.js";

export interface MigrationOptions {
  /** Stable timestamp prefix for the init migration filename. */
  timestamp: number;
  /** Name component of the filename, e.g. "init". */
  name: string;
}

const INIT_OPTIONS: MigrationOptions = {
  timestamp: 1700000000,
  name: "init",
};

/**
 * The exact collections `1700000000_init.js` covers. Frozen on purpose:
 * that migration is already applied against prod, so its generated
 * content must never change even as COLLECTIONS grows — PocketBase skips
 * re-running a migration filename it's already recorded, so a mutated
 * init.js wouldn't reach prod anyway, it'd just silently diverge from
 * what's actually applied there. New collections get their own
 * incremental migration (see MATCHMAKING_OPTIONS below) instead of
 * being folded in here.
 */
const INIT_COLLECTION_NAMES = [
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
] as const;

/**
 * Frozen shape of `achievements`/`match_players` as first applied by
 * 1700000000_init.js — before achievement propose/approve and placement
 * tracking. Same reasoning as MATCHMAKING_SNAPSHOT below: init.js already
 * ran against prod, so its generated content must never change even
 * though schema.ts's live COLLECTIONS evolved past it (see
 * pb_migrations/1735689800_achievements_teams.js for the real
 * alteration). Every other init collection hasn't diverged from its
 * original shape, so it's still read live from COLLECTIONS.
 */
const INIT_SNAPSHOT: readonly CollectionDef[] = [
  {
    name: "achievements",
    type: "base",
    fields: [
      { name: "game", type: "relation", relationTo: "games", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "title", type: "text", required: true, min: 1, max: 80 },
      { name: "description", type: "text", required: true, min: 1, max: 300 },
      { name: "trigger_expr", type: "text", required: true, min: 1, max: 500 },
      { name: "rarity", type: "select", required: true, maxSelect: 1, options: ["common", "rare", "epic"] },
      { name: "icon", type: "text", max: 20 },
    ],
    listRule: "",
    viewRule: "",
  },
  {
    name: "match_players",
    type: "base",
    fields: [
      { name: "match", type: "relation", relationTo: "matches", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "won", type: "bool" },
      { name: "rating", type: "select", maxSelect: 1, options: ["like", "dislike"] },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_mp_match_player ON match_players (match, player)",
    ],
    listRule: "",
    viewRule: "",
  },
];

function initDefaultCollections(): readonly CollectionDef[] {
  const snapshotByName = new Map(INIT_SNAPSHOT.map((c) => [c.name, c]));
  const names: readonly string[] = INIT_COLLECTION_NAMES;
  // Substitute in place rather than prepending, so collection order in the
  // generated file matches the original declaration order exactly — the
  // frozen ones aren't necessarily first in INIT_COLLECTION_NAMES.
  return COLLECTIONS.filter((c) => names.includes(c.name)).map(
    (c) => snapshotByName.get(c.name) ?? c,
  );
}

const MATCHMAKING_OPTIONS: MigrationOptions = {
  timestamp: 1735689600,
  name: "matchmaking",
};

const MATCHMAKING_COLLECTION_NAMES = [
  "availabilities",
  "match_proposals",
  "invites",
  "push_subscriptions",
] as const;

const PILES_OPTIONS: MigrationOptions = {
  timestamp: 1735689900,
  name: "piles",
};

const PILES_COLLECTION_NAMES = ["piles_claims"] as const;

/**
 * Frozen shape of `availabilities`/`match_proposals` as first applied by
 * 1735689600_matchmaking.js (time_slot enum, not the later start_hour/
 * end_hour range shape). Same reasoning as INIT_COLLECTION_NAMES above:
 * this migration already ran against prod, so its generated content must
 * never change even though schema.ts's live COLLECTIONS evolved past it
 * the same day (see pb_migrations/1735689700_availability_hours.js for
 * the real alteration). `invites`/`push_subscriptions` haven't diverged
 * from their original shape, so they're still read live from COLLECTIONS.
 */
const MATCHMAKING_SNAPSHOT: readonly CollectionDef[] = [
  {
    name: "availabilities",
    type: "base",
    fields: [
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "role", type: "select", required: true, maxSelect: 1, options: ["host", "player"] },
      { name: "weekday", type: "select", required: true, maxSelect: 1, options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      { name: "time_slot", type: "select", required: true, maxSelect: 1, options: ["morning", "afternoon", "evening", "night"] },
      { name: "capacity", type: "number", min: 1 },
      { name: "max_group_size", type: "number", min: 1 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_avail_player_role_slot ON availabilities (player, role, weekday, time_slot)",
    ],
    listRule: "",
    viewRule: "",
    createRule: "player = @request.auth.id",
    updateRule: "player = @request.auth.id",
    deleteRule: "player = @request.auth.id",
  },
  {
    name: "match_proposals",
    type: "base",
    fields: [
      { name: "weekday", type: "select", required: true, maxSelect: 1, options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      { name: "time_slot", type: "select", required: true, maxSelect: 1, options: ["morning", "afternoon", "evening", "night"] },
      { name: "proposed_date", type: "date", required: true },
      { name: "host", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "status", type: "select", required: true, maxSelect: 1, options: ["proposed", "confirmed", "cancelled", "expired"] },
      { name: "session", type: "relation", relationTo: "sessions", maxSelect: 1 },
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: "host = @request.auth.id",
    deleteRule: null,
  },
];

/**
 * Build a migration that creates exactly `toCreate`, validating relation
 * targets against the fuller `allCollections` (so e.g. a new collection
 * relating to `players` type-checks without `players` itself needing to
 * be re-created by this same migration).
 */
export function buildMigration(
  toCreate: readonly CollectionDef[],
  allCollections: readonly CollectionDef[],
): string {
  const errors = validateSchema(allCollections);
  if (errors.length > 0) {
    throw new Error(
      "Schema validation failed:\n" +
        errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n"),
    );
  }

  const payload = toCreate.map((c) => collectionToJson(c));
  const json = JSON.stringify(payload, null, 2);

  return [
    "// AUTO-GENERATED by scripts/build-migrations.ts — do not edit by hand.",
    '/// <reference path="../pb_data/types.d.ts" />',
    "",
    "migrate(",
    "  (app) => {",
    `    const collections = ${indent(json, 4).trimStart()};`,
    "    for (const data of collections) {",
    "      const collection = new Collection(data);",
    "      app.save(collection);",
    "    }",
    "  },",
    "  (app) => {",
    `    const names = ${JSON.stringify(
      [...toCreate].map((c) => c.name).reverse(),
    )};`,
    "    for (const name of names) {",
    "      try {",
    "        const collection = app.findCollectionByNameOrId(name);",
    "        app.delete(collection);",
    "      } catch (_) { /* already gone */ }",
    "    }",
    "  },",
    ");",
    "",
  ].join("\n");
}

export function buildInitMigration(
  collections: readonly CollectionDef[] = initDefaultCollections(),
): string {
  return buildMigration(collections, collections);
}

export function buildMatchmakingMigration(
  allCollections: readonly CollectionDef[] = COLLECTIONS,
): string {
  const snapshotByName = new Map(MATCHMAKING_SNAPSHOT.map((c) => [c.name, c]));
  const names: readonly string[] = MATCHMAKING_COLLECTION_NAMES;
  // Substitute in place rather than prepending, so collection order in the
  // generated file matches the original declaration order exactly.
  const toCreate = allCollections
    .filter((c) => names.includes(c.name))
    .map((c) => snapshotByName.get(c.name) ?? c);
  return buildMigration(toCreate, allCollections);
}

export function buildPilesMigration(
  allCollections: readonly CollectionDef[] = COLLECTIONS,
): string {
  const names: readonly string[] = PILES_COLLECTION_NAMES;
  const toCreate = allCollections.filter((c) => names.includes(c.name));
  return buildMigration(toCreate, allCollections);
}

function collectionToJson(c: CollectionDef): Record<string, unknown> {
  // PocketBase enforces field uniqueness through SQL indexes, not via a
  // per-field flag. Promote every field marked `unique: true` to a real
  // UNIQUE INDEX so identityFields and similar constraints actually hold.
  const autoIndexes = c.fields
    .filter((f) => f.unique)
    .map(
      (f) =>
        `CREATE UNIQUE INDEX idx_${c.name}_${f.name} ON ${c.name} (${f.name})`,
    );
  const userFields = c.fields.map(fieldToJson);
  const fields =
    c.type === "auth"
      ? [...authSystemFields(), ...userFields]
      : [...baseSystemFields(), ...userFields];

  const base: Record<string, unknown> = {
    id: collectionIdFor(c.name),
    name: c.name,
    type: c.type ?? "base",
    system: false,
    fields,
    indexes: [...autoIndexes, ...(c.indexes ?? [])],
    listRule: c.listRule ?? null,
    viewRule: c.viewRule ?? null,
    createRule: c.createRule ?? null,
    updateRule: c.updateRule ?? null,
    deleteRule: c.deleteRule ?? null,
  };
  if (c.type === "auth") {
    base.passwordAuth = {
      enabled: true,
      identityFields: [...AUTH_OPTIONS.identityFields],
    };
    base.oauth2 = { enabled: false, providers: [] };
    base.mfa = { enabled: false, duration: 0, rule: "" };
    base.otp = { enabled: false };
    base.manageRule = null;
    base.authRule = "";
    base.authToken = { duration: 1209600 };
    base.passwordResetToken = { duration: 1800 };
    base.emailChangeToken = { duration: 1800 };
    base.verificationToken = { duration: 259200 };
    base.fileToken = { duration: 180 };
  }
  return base;
}

/**
 * v0.23+ PocketBase no longer auto-injects `id`, `created`, `updated` into
 * base collections defined via JSON migrations — we must declare them.
 * Without `created` the standard `-created` sort key is unavailable.
 */
function baseSystemFields(): Array<Record<string, unknown>> {
  return [
    {
      id: "text3208210256",
      name: "id",
      type: "text",
      system: true,
      required: true,
      presentable: false,
      primaryKey: true,
      hidden: false,
      min: 15,
      max: 15,
      pattern: "^[a-z0-9]+$",
      autogeneratePattern: "[a-z0-9]{15}",
    },
    {
      id: "autodate2990389176",
      name: "created",
      type: "autodate",
      system: true,
      hidden: false,
      presentable: false,
      onCreate: true,
      onUpdate: false,
    },
    {
      id: "autodate3332085495",
      name: "updated",
      type: "autodate",
      system: true,
      hidden: false,
      presentable: false,
      onCreate: true,
      onUpdate: true,
    },
  ];
}

/**
 * Override the system fields PB injects on every auth collection so that
 *   - email is optional (we authenticate via nickname),
 *   - password accepts a 4-character passcode.
 * Names must match exactly; PB merges by name.
 */
function authSystemFields(): Array<Record<string, unknown>> {
  return [
    {
      id: "text3208210256",
      name: "id",
      type: "text",
      system: true,
      required: true,
      presentable: false,
      primaryKey: true,
      hidden: false,
      min: 15,
      max: 15,
      pattern: "^[a-z0-9]+$",
      autogeneratePattern: "[a-z0-9]{15}",
    },
    {
      id: "password901924565",
      name: "password",
      type: "password",
      system: true,
      hidden: true,
      required: true,
      presentable: false,
      min: AUTH_OPTIONS.minPasswordLength,
      max: 71,
      pattern: "",
      cost: 0,
    },
    {
      id: "text2504183744",
      name: "tokenKey",
      type: "text",
      system: true,
      hidden: true,
      required: true,
      presentable: false,
      min: 30,
      max: 60,
      pattern: "",
      autogeneratePattern: "[a-zA-Z0-9_]{50}",
    },
    {
      id: "email3885137012",
      name: "email",
      type: "email",
      system: true,
      hidden: false,
      required: false,
      presentable: false,
      onlyDomains: null,
      exceptDomains: null,
    },
    {
      id: "bool1547992806",
      name: "emailVisibility",
      type: "bool",
      system: true,
      hidden: false,
      required: false,
      presentable: false,
    },
    {
      id: "bool256245529",
      name: "verified",
      type: "bool",
      system: true,
      hidden: false,
      required: false,
      presentable: false,
    },
    {
      id: "autodate2990389176",
      name: "created",
      type: "autodate",
      system: true,
      hidden: false,
      presentable: false,
      onCreate: true,
      onUpdate: false,
    },
    {
      id: "autodate3332085495",
      name: "updated",
      type: "autodate",
      system: true,
      hidden: false,
      presentable: false,
      onCreate: true,
      onUpdate: true,
    },
  ];
}

function fieldToJson(f: FieldDef): Record<string, unknown> {
  const common: Record<string, unknown> = {
    name: f.name,
    type: f.type,
    required: f.required ?? false,
    presentable: false,
    system: false,
  };

  switch (f.type) {
    case "text":
      return {
        ...common,
        min: f.min ?? null,
        max: f.max ?? null,
        pattern: "",
        primaryKey: false,
      };
    case "number":
      return {
        ...common,
        min: f.min ?? null,
        max: f.max ?? null,
        onlyInt: false,
      };
    case "bool":
      return common;
    case "date":
      return { ...common, min: "", max: "" };
    case "json":
      return { ...common, maxSize: f.maxSize ?? 2_000_000 };
    case "select":
      return {
        ...common,
        maxSelect: f.maxSelect ?? 1,
        values: [...(f.options ?? [])],
      };
    case "relation":
      return {
        ...common,
        collectionId: collectionIdFor(f.relationTo!),
        maxSelect: f.maxSelect ?? 0,
        minSelect: 0,
        cascadeDelete: f.cascadeDelete ?? false,
      };
    case "file":
      return {
        ...common,
        maxSelect: f.maxSelect ?? 1,
        maxSize: f.maxSize ?? 5_242_880,
        mimeTypes: [],
        thumbs: [],
        protected: false,
      };
  }
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? line : pad + line))
    .join("\n");
}

function migrationFilename(opts: MigrationOptions): string {
  return `${opts.timestamp}_${opts.name}.js`;
}

function repoRoot(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

export function writeInitMigration(
  opts: MigrationOptions = INIT_OPTIONS,
  collections: readonly CollectionDef[] = initDefaultCollections(),
): { path: string; contents: string; changed: boolean } {
  const root = repoRoot();
  const dir = join(root, "pb_migrations");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, migrationFilename(opts));
  const contents = buildInitMigration(collections);
  let previous = "";
  try {
    previous = readFileSync(path, "utf8");
  } catch {
    // first run
  }
  if (previous === contents) {
    return { path, contents, changed: false };
  }
  writeFileSync(path, contents, "utf8");
  return { path, contents, changed: true };
}

export function writeMatchmakingMigration(
  opts: MigrationOptions = MATCHMAKING_OPTIONS,
  allCollections: readonly CollectionDef[] = COLLECTIONS,
): { path: string; contents: string; changed: boolean } {
  const root = repoRoot();
  const dir = join(root, "pb_migrations");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, migrationFilename(opts));
  const contents = buildMatchmakingMigration(allCollections);
  let previous = "";
  try {
    previous = readFileSync(path, "utf8");
  } catch {
    // first run
  }
  if (previous === contents) {
    return { path, contents, changed: false };
  }
  writeFileSync(path, contents, "utf8");
  return { path, contents, changed: true };
}

export function writePilesMigration(
  opts: MigrationOptions = PILES_OPTIONS,
  allCollections: readonly CollectionDef[] = COLLECTIONS,
): { path: string; contents: string; changed: boolean } {
  const root = repoRoot();
  const dir = join(root, "pb_migrations");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, migrationFilename(opts));
  const contents = buildPilesMigration(allCollections);
  let previous = "";
  try {
    previous = readFileSync(path, "utf8");
  } catch {
    // first run
  }
  if (previous === contents) {
    return { path, contents, changed: false };
  }
  writeFileSync(path, contents, "utf8");
  return { path, contents, changed: true };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  for (const result of [writeInitMigration(), writeMatchmakingMigration(), writePilesMigration()]) {
    const rel = result.path.replace(repoRoot() + "\\", "").replace(repoRoot() + "/", "");
    if (result.changed) {
      console.log(`[build-migrations] wrote ${rel}`);
    } else {
      console.log(`[build-migrations] no changes: ${rel}`);
    }
  }
}
