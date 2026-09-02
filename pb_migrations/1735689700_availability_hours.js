/// <reference path="../pb_data/types.d.ts" />
/**
 * Replaces the fixed time_slot enum (morning/afternoon/evening/night) with
 * real start_hour/end_hour ranges on availabilities and match_proposals —
 * both already live under the original shape (1735689600_matchmaking.js,
 * frozen to that shape, see MATCHMAKING_SNAPSHOT in build-migrations.ts),
 * so this is a hand-written alteration of already-applied collections,
 * same pattern as 1735689601_matchmaking_rules.js.
 *
 * Pre-launch test data only — existing availabilities/match_proposals/
 * invites rows are cleared as part of this deploy rather than converted
 * (see pendientes/gamesessions.md), so this migration doesn't attempt a
 * time_slot -> hour range data conversion.
 */
migrate(
  (app) => {
    const availabilities = app.findCollectionByNameOrId("availabilities");
    availabilities.fields.add(
      new Field({ name: "start_hour", type: "number", required: true, min: 0, max: 23, onlyInt: true }),
    );
    availabilities.fields.add(
      new Field({ name: "end_hour", type: "number", required: true, min: 1, max: 24, onlyInt: true }),
    );
    availabilities.fields.removeByName("time_slot");
    availabilities.indexes = [
      "CREATE UNIQUE INDEX idx_avail_player_role_range ON availabilities (player, role, weekday, start_hour, end_hour)",
    ];
    app.save(availabilities);

    const proposals = app.findCollectionByNameOrId("match_proposals");
    proposals.fields.add(
      new Field({ name: "start_hour", type: "number", required: true, min: 0, max: 23, onlyInt: true }),
    );
    proposals.fields.add(
      new Field({ name: "end_hour", type: "number", required: true, min: 1, max: 24, onlyInt: true }),
    );
    proposals.fields.removeByName("time_slot");
    app.save(proposals);
  },
  (app) => {
    const availabilities = app.findCollectionByNameOrId("availabilities");
    availabilities.fields.add(
      new Field({
        name: "time_slot",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["morning", "afternoon", "evening", "night"],
      }),
    );
    availabilities.fields.removeByName("start_hour");
    availabilities.fields.removeByName("end_hour");
    availabilities.indexes = [
      "CREATE UNIQUE INDEX idx_avail_player_role_slot ON availabilities (player, role, weekday, time_slot)",
    ];
    app.save(availabilities);

    const proposals = app.findCollectionByNameOrId("match_proposals");
    proposals.fields.add(
      new Field({
        name: "time_slot",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["morning", "afternoon", "evening", "night"],
      }),
    );
    proposals.fields.removeByName("start_hour");
    proposals.fields.removeByName("end_hour");
    app.save(proposals);
  },
);
