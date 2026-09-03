/// <reference path="../pb_data/types.d.ts" />
/**
 * Two independent additions to already-applied collections from
 * 1700000000_init.js (frozen, see INIT_SNAPSHOT in build-migrations.ts):
 *
 * - achievements: propose/approve workflow. Any player can now create one
 *   (createRule opens up), but pb_hooks/achievement_proposal.pb.js forces
 *   status to "pending" server-side regardless of what's submitted — only
 *   a superuser flipping it to "approved" via the admin dashboard makes it
 *   count. Existing rows (from Gemini generation before this migration)
 *   are backfilled to "pending" too, so past AI output goes through the
 *   same review gate rather than being silently grandfathered in.
 *
 * - match_players: optional placement (1st/2nd/3rd...) alongside the
 *   existing won boolean, for games that rank results instead of a plain
 *   win/lose.
 */
migrate(
  (app) => {
    const achievements = app.findCollectionByNameOrId("achievements");
    achievements.fields.add(
      new Field({ name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "approved"] }),
    );
    achievements.fields.add(
      new Field({ name: "proposed_by", type: "relation", collectionId: app.findCollectionByNameOrId("players").id, maxSelect: 1 }),
    );
    achievements.createRule = '@request.auth.id != ""';
    app.save(achievements);

    const existing = app.findRecordsByFilter("achievements", "", "", 5000, 0);
    for (const record of existing) {
      record.set("status", "pending");
      app.save(record);
    }

    const matchPlayers = app.findCollectionByNameOrId("match_players");
    matchPlayers.fields.add(new Field({ name: "placement", type: "number", min: 1 }));
    app.save(matchPlayers);
  },
  (app) => {
    const achievements = app.findCollectionByNameOrId("achievements");
    achievements.fields.removeByName("status");
    achievements.fields.removeByName("proposed_by");
    achievements.createRule = null;
    app.save(achievements);

    const matchPlayers = app.findCollectionByNameOrId("match_players");
    matchPlayers.fields.removeByName("placement");
    app.save(matchPlayers);
  },
);
