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
  identityFields: readonly string[];
}

export const AUTH_OPTIONS: AuthOptions = {
  minPasswordLength: 4,
  identityFields: ["nickname"],
};

/**
 * Stable, 15-char alphanumeric ID for a collection. PocketBase v0.23+
 * requires `collectionId` on relations to point at an existing collection
 * id (not its name), so we precompute a deterministic id per name. The
 * `pbc_` prefix mirrors PB's own convention.
 */
export function collectionIdFor(name: string): string {
  const target = 15;
  const prefix = "pbc_";
  const room = target - prefix.length;
  const base = name.replace(/[^a-zA-Z0-9_]/g, "_");
  if (base.length >= room) return prefix + base.slice(0, room);
  return prefix + base + "0".repeat(room - base.length);
}

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
    name: "players",
    type: "auth",
    fields: [
      { name: "nickname", type: "text", required: true, unique: true, min: 2, max: 24 },
      // PocketBase treats required:true on a number field as "must be > 0",
      // so xp/re_rolls (which start at 0) stay optional with a min:0 floor.
      { name: "xp", type: "number", min: 0 },
      { name: "level", type: "number", required: true, min: 1 },
      { name: "re_rolls", type: "number", min: 0 },
      { name: "favorite_categories", type: "relation", relationTo: "categories" },
    ],
    listRule: "",
    viewRule: "",
    // Open signup: anyone can create a player. Once authenticated, players
    // can only update their own record and never delete it via the API.
    createRule: "",
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
      { name: "owned_by", type: "relation", relationTo: "players" },
      { name: "created_by", type: "relation", relationTo: "players", maxSelect: 1, required: true },
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
      { name: "host", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "co_host", type: "relation", relationTo: "players", maxSelect: 1 },
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
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "status", type: "select", required: true, maxSelect: 1, options: ["present", "playing", "spectator", "kicked", "left"] },
      { name: "joined_at", type: "date", required: true },
      { name: "left_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_sp_session_player ON session_participants (session, player)",
    ],
    listRule: "",
    viewRule: "",
    // createRule/updateRule/deleteRule are unset here (-> null, superuser
    // only) because this collection belongs to the frozen init migration
    // (see INIT_COLLECTION_NAMES in build-migrations.ts) — this file must
    // keep generating that migration's exact original content. The real,
    // current createRule ("player = @request.auth.id") was added later by
    // pb_migrations/1735689601_matchmaking_rules.js, hand-written outside
    // this generator. Treat that migration as the source of truth for
    // this collection's actual rules, not the block below.
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
    // Same note as session_participants above: real createRule
    // ('@request.auth.id != "" && session.host = @request.auth.id') is
    // set by pb_migrations/1735689601_matchmaking_rules.js, not here.
  },

  {
    name: "match_players",
    type: "base",
    fields: [
      { name: "match", type: "relation", relationTo: "matches", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "won", type: "bool" },
      // Tri-state by design: empty = not rated yet. PB bool defaults to false,
      // which would otherwise be indistinguishable from "rated as 👎".
      { name: "rating", type: "select", maxSelect: 1, options: ["like", "dislike"] },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_mp_match_player ON match_players (match, player)",
    ],
    listRule: "",
    viewRule: "",
  },

  {
    name: "votes",
    type: "base",
    fields: [
      { name: "match", type: "relation", relationTo: "matches", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "game", type: "relation", relationTo: "games", maxSelect: 1 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_votes_match_player ON votes (match, player)",
    ],
    listRule: "",
    viewRule: "",
    // Same note as session_participants above: real createRule/updateRule
    // ("player = @request.auth.id") are set by
    // pb_migrations/1735689601_matchmaking_rules.js, not here.
  },

  {
    name: "player_achievements",
    type: "base",
    fields: [
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "achievement", type: "relation", relationTo: "achievements", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "unlocked_at", type: "date", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_pa_player_achievement ON player_achievements (player, achievement)",
    ],
    listRule: "",
    viewRule: "",
  },

  // --- Weekly matchmaking (added 2026-09-02) ---------------------------
  // Standing weekly host/player availability, independent of any one
  // session. A player can post either or both roles per weekday+range.
  //
  // Real hour ranges (added 2026-09-02, later same day) — this collection
  // was already live under the original time_slot shape, so the field
  // change below isn't what's actually applied by the generated
  // 1735689600_matchmaking.js (frozen to its original shape, see
  // MATCHMAKING_SNAPSHOT in build-migrations.ts). The real alteration is
  // pb_migrations/1735689700_availability_hours.js, hand-written the same
  // way 1735689601_matchmaking_rules.js patched already-applied rules.
  {
    name: "availabilities",
    type: "base",
    fields: [
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "role", type: "select", required: true, maxSelect: 1, options: ["host", "player"] },
      { name: "weekday", type: "select", required: true, maxSelect: 1, options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      // Half-open [start_hour, end_hour) range, whole-hour granularity.
      // end_hour may be 24 to mean "through midnight."
      { name: "start_hour", type: "number", required: true, min: 0, max: 23 },
      { name: "end_hour", type: "number", required: true, min: 1, max: 24 },
      // Host rows only: max attendees they can host. Player rows only:
      // max group size they're willing to join; null = no preference.
      { name: "capacity", type: "number", min: 1 },
      { name: "max_group_size", type: "number", min: 1 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_avail_player_role_range ON availabilities (player, role, weekday, start_hour, end_hour)",
    ],
    listRule: "",
    viewRule: "",
    createRule: "player = @request.auth.id",
    updateRule: "player = @request.auth.id",
    deleteRule: "player = @request.auth.id",
  },

  // The weekly cron's output: one row per (host, weekday) group it matched
  // this week — start_hour/end_hour is the host's own range (players just
  // need enough overlap with it, see matchmaking.ts). Created only by the
  // matchmaker hook (createRule null — $app.save() in a hook bypasses API
  // rules entirely); the host can update their own proposal client-side
  // to confirm it once enough players accept.
  //
  // Real hour ranges: same note as availabilities above — the actual
  // alteration lives in pb_migrations/1735689700_availability_hours.js,
  // not in the frozen 1735689600_matchmaking.js.
  {
    name: "match_proposals",
    type: "base",
    fields: [
      { name: "weekday", type: "select", required: true, maxSelect: 1, options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
      { name: "start_hour", type: "number", required: true, min: 0, max: 23 },
      { name: "end_hour", type: "number", required: true, min: 1, max: 24 },
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

  // One row per player invited into a proposal. `invite_token` mirrors
  // `sessions.qr_token`'s shape — an opaque token so a not-yet-logged-in
  // recipient can open /invite/[token] and respond without an active
  // PB auth session. Accept/decline writes go straight through the API
  // via the token-scoped updateRule below, no hook needed for that part.
  // Named "invites", not "match_proposal_players": collectionIdFor()
  // truncates names >=11 chars to their first 11, and "match_proposal_"
  // would collide with "match_proposals" itself under that truncation.
  {
    name: "invites",
    type: "base",
    fields: [
      { name: "proposal", type: "relation", relationTo: "match_proposals", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true },
      { name: "response", type: "select", required: true, maxSelect: 1, options: ["pending", "accepted", "declined"] },
      { name: "invite_token", type: "text", required: true, unique: true, min: 8, max: 64 },
      { name: "responded_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_invites_proposal_player ON invites (proposal, player)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: 'invite_token = @request.query.token && response = "pending"',
    deleteRule: null,
  },

  // Web Push subscriptions. Client-managed directly (register on opt-in,
  // delete on opt-out) — no hook involvement for CRUD, only for reading
  // these when the weekly matcher sends notifications.
  {
    name: "push_subscriptions",
    type: "base",
    fields: [
      { name: "player", type: "relation", relationTo: "players", maxSelect: 1, required: true, cascadeDelete: true },
      { name: "endpoint", type: "text", required: true, max: 500 },
      { name: "p256dh", type: "text", required: true, max: 300 },
      { name: "auth", type: "text", required: true, max: 100 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_push_player_endpoint ON push_subscriptions (player, endpoint)",
    ],
    listRule: "",
    viewRule: "",
    createRule: "player = @request.auth.id",
    updateRule: "player = @request.auth.id",
    deleteRule: "player = @request.auth.id",
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
