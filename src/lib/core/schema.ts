/**
 * Source of truth for the PocketBase schema.
 *
 * The objects in COLLECTIONS are consumed by scripts/build-migrations.ts
 * to generate the PocketBase JS migration(s) under pb_migrations/.
 * Unit tests assert internal consistency (no dangling relations, unique
 * names, etc.) so that typos are caught before a deploy touches the DB.
 *
 * This module must stay dependency-free so it can be imported from both
 * the SvelteKit frontend (for typing API responses) and the codegen script.
 */

export type FieldType =
  | "text"
  | "number"
  | "bool"
  | "select"
  | "relation"
  | "file"
  | "json"
  | "date";

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  min?: number;
  max?: number;
  /** For `select` fields. */
  options?: readonly string[];
  /** Max number of picks. 1 = single, undefined/0 = unlimited. */
  maxSelect?: number;
  /** Required for `relation` fields: target collection name. */
  relationTo?: string;
  /** For `relation` fields: cascade delete on parent removal. */
  cascadeDelete?: boolean;
  /** For `file` fields: max file size in bytes. */
  maxSize?: number;
}

export interface CollectionDef {
  name: string;
  type?: "base" | "auth";
  fields: readonly FieldDef[];
  indexes?: readonly string[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
}

export interface AuthOptions {
  minPasswordLength: number;
  allowUsernameAuth: boolean;
  allowEmailAuth: boolean;
  requireEmail: boolean;
}

export const AUTH_OPTIONS: AuthOptions = {
  minPasswordLength: 4,
  allowUsernameAuth: true,
  allowEmailAuth: false,
  requireEmail: false,
};

/**
 * Canonical schema. Order matters: relations can only reference collections
 * defined earlier in the array so the generated migration creates them in a
 * topologically valid order.
 */
export const COLLECTIONS: readonly CollectionDef[] = [
  {
    name: "categories",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true, unique: true, min: 2, max: 30 },
      { name: "icon", type: "text", max: 20 },
    ],
    listRule: "",
    viewRule: "",
  },

  {
    name: "users",
    type: "auth",
    fields: [
      { name: "nickname", type: "text", required: true, unique: true, min: 2, max: 24 },
      { name: "xp", type: "number", required: true, min: 0 },
      { name: "level", type: "number", required: true, min: 1 },
      { name: "re_rolls", type: "number", required: true, min: 0 },
      { name: "favorite_categories", type: "relation", relationTo: "categories" },
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: "id = @request.auth.id",
    deleteRule: null,
  },

  {
    name: "games",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true, unique: true, min: 1, max: 80 },
      { name: "min_players", type: "number", required: true, min: 1 },
      { name: "max_players", type: "number", required: true, min: 1 },
      { name: "categories", type: "relation", relationTo: "categories" },
      { name: "image", type: "file", maxSelect: 1, maxSize: 2_097_152 },
      { name: "description", type: "text", max: 500 },
      { name: "owned_by", type: "relation", relationTo: "users" },
      { name: "created_by", type: "relation", relationTo: "users", maxSelect: 1, required: true },
    ],
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "created_by = @request.auth.id",
    deleteRule: "created_by = @request.auth.id",
  },

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
    name: "sessions",
    type: "base",
    fields: [
      { name: "host", type: "relation", relationTo: "users", maxSelect: 1, required: true },
      { name: "co_host", type: "relation", relationTo: "users", maxSelect: 1 },
      { name: "status", type: "select", required: true, maxSelect: 1, options: ["created", "active", "ended"] },
      { name: "started_at", type: "date" },
      { name: "ended_at", type: "date" },
      { name: "qr_token", type: "text", required: true, unique: true, min: 8, max: 64 },
    ],
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "host = @request.auth.id",
    deleteRule: "host = @request.auth.id",
  },

  {
    name: "session_participants",
    type: "base",
    fields: [
      { name: "session", type: "relation", relationTo: "sessions", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", relationTo: "users", maxSelect: 1, required: true },
      { name: "status", type: "select", required: true, maxSelect: 1, options: ["present", "playing", "spectator", "kicked", "left"] },
      { name: "joined_at", type: "date", required: true },
      { name: "left_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_sp_session_user ON session_participants (session, user)",
    ],
    listRule: "",
    viewRule: "",
  },

  {
    name: "matches",
    type: "base",
    fields: [
      { name: "session", type: "relation", relationTo: "sessions", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "game", type: "relation", relationTo: "games", maxSelect: 1 },
      { name: "status", type: "select", required: true, maxSelect: 1, options: ["voting", "playing", "done"] },
      { name: "started_at", type: "date" },
      { name: "ended_at", type: "date" },
      { name: "duration_seconds", type: "number", min: 0 },
      { name: "was_random", type: "bool" },
    ],
    listRule: "",
    viewRule: "",
  },

  {
    name: "match_players",
    type: "base",
    fields: [
      { name: "match", type: "relation", relationTo: "matches", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", relationTo: "users", maxSelect: 1, required: true },
      { name: "won", type: "bool" },
      { name: "liked", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_mp_match_user ON match_players (match, user)",
    ],
    listRule: "",
    viewRule: "",
  },

  {
    name: "votes",
    type: "base",
    fields: [
      { name: "match", type: "relation", relationTo: "matches", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", relationTo: "users", maxSelect: 1, required: true },
      { name: "game", type: "relation", relationTo: "games", maxSelect: 1 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_votes_match_user ON votes (match, user)",
    ],
    listRule: "",
    viewRule: "",
  },

  {
    name: "user_achievements",
    type: "base",
    fields: [
      { name: "user", type: "relation", relationTo: "users", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "achievement", type: "relation", relationTo: "achievements", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "unlocked_at", type: "date", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_ua_user_achievement ON user_achievements (user, achievement)",
    ],
    listRule: "",
    viewRule: "",
  },
];

export interface SchemaError {
  path: string;
  message: string;
}

export function validateSchema(
  collections: readonly CollectionDef[],
): SchemaError[] {
  const errors: SchemaError[] = [];
  const names = new Set<string>();
  const indexPerName = new Map<string, number>();

  collections.forEach((c, idx) => {
    if (names.has(c.name)) {
      errors.push({ path: c.name, message: "duplicate collection name" });
    }
    names.add(c.name);
    indexPerName.set(c.name, idx);

    if (c.fields.length === 0) {
      errors.push({ path: c.name, message: "collection has no fields" });
    }

    const fieldNames = new Set<string>();
    for (const f of c.fields) {
      const where = `${c.name}.${f.name}`;

      if (fieldNames.has(f.name)) {
        errors.push({ path: where, message: "duplicate field name" });
      }
      fieldNames.add(f.name);

      if (!/^[a-z][a-z0-9_]*$/.test(f.name)) {
        errors.push({ path: where, message: "field name must be snake_case ASCII" });
      }

      if (f.type === "select" && (!f.options || f.options.length === 0)) {
        errors.push({ path: where, message: "select field must define options" });
      }

      if (f.type === "relation") {
        if (!f.relationTo) {
          errors.push({ path: where, message: "relation field must define relationTo" });
        } else if (!names.has(f.relationTo)) {
          errors.push({
            path: where,
            message: `relationTo "${f.relationTo}" must reference a collection defined earlier`,
          });
        }
      }

      if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
        errors.push({ path: where, message: `min (${f.min}) > max (${f.max})` });
      }
    }

    for (const sql of c.indexes ?? []) {
      if (!sql.includes(`ON ${c.name} `) && !sql.includes(`ON ${c.name}(`)) {
        errors.push({
          path: `${c.name}.indexes`,
          message: `index SQL should target table "${c.name}": ${sql}`,
        });
      }
    }
  });

  return errors;
}
