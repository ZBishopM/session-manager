/// <reference path="../pb_data/types.d.ts" />
/**
 * session_participants, matches, and votes were all createRule: null
 * (superuser-only) — nothing in the original schema ever let a real
 * player write to them from the client. That's why the join button,
 * "start session," and voting were all stubs: even a wired-up click
 * handler would have gotten a 403. This migration opens exactly the
 * writes the new session/[id] console needs, nothing more.
 */
migrate(
  (app) => {
    const participants = app.findCollectionByNameOrId("session_participants");
    participants.createRule = "player = @request.auth.id";
    app.save(participants);

    const matches = app.findCollectionByNameOrId("matches");
    matches.createRule = '@request.auth.id != "" && session.host = @request.auth.id';
    app.save(matches);

    const votes = app.findCollectionByNameOrId("votes");
    votes.createRule = "player = @request.auth.id";
    votes.updateRule = "player = @request.auth.id";
    app.save(votes);
  },
  (app) => {
    const participants = app.findCollectionByNameOrId("session_participants");
    participants.createRule = null;
    app.save(participants);

    const matches = app.findCollectionByNameOrId("matches");
    matches.createRule = null;
    app.save(matches);

    const votes = app.findCollectionByNameOrId("votes");
    votes.createRule = null;
    votes.updateRule = null;
    app.save(votes);
  },
);
