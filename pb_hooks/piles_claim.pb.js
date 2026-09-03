/// <reference path="../pb_data/types.d.ts" />
/**
 * Public endpoint piles-game's own client-side JS calls directly at
 * game-over (client/lobby.html in the separate piles-game repo) — no
 * changes to piles-game's Rust server at all. Body: { code, placement,
 * points }. Validates the claim code (from /profile's "Vincular Piles"),
 * then creates a synthetic play record so the result flows through the
 * *existing* XP/achievement pipeline exactly like a real hosted match:
 * a throwaway session + session_participants row, a matches row created
 * as "voting" then immediately updated to "done" (match_finished.pb.js
 * only fires on that transition, not on create), and a match_players row.
 *
 * `points` is stored for reference only — not converted into XP here.
 */
routerAdd("POST", "/api/piles/claim", (e) => {
  // routerAdd handlers run on a pooled VM per request, unlike cron/event
  // hooks — a module-level const isn't reliably closed over across pool
  // instances, so anything the handler needs must be declared inside it.
  const CLAIM_MAX_AGE_MS = 15 * 60 * 1000;
  const core = require(`${__hooks}/_core.js`);
  const body = new DynamicModel({ code: "", placement: 0, points: 0 });
  try {
    e.bindBody(body);
  } catch (err) {
    return e.json(400, { ok: false, error: "invalid request body" });
  }

  const code = (body.code || "").toString().trim();
  const placement = Number(body.placement) || null;
  const points = Number(body.points) || 0;
  if (!code) {
    return e.json(400, { ok: false, error: "missing code" });
  }

  let claim;
  try {
    claim = $app.findFirstRecordByFilter("piles_claims", `code = "${code}"`);
  } catch (err) {
    return e.json(404, { ok: false, error: "unknown code" });
  }

  try {
    // .get() on a date-type field returns a DateTime object, always
    // truthy regardless of its zero-ness — use getDateTime().isZero().
    if (!claim.getDateTime("consumed_at").isZero()) {
      return e.json(409, { ok: false, error: "code already used" });
    }
    const ageMs = Date.now() - claim.getDateTime("created").unix() * 1000;
    if (ageMs > CLAIM_MAX_AGE_MS) {
      return e.json(410, { ok: false, error: "code expired" });
    }

    let pilesGame;
    try {
      pilesGame = $app.findFirstRecordByFilter("games", 'name = "Piles"');
    } catch (err) {
      return e.json(500, { ok: false, error: "Piles game not configured" });
    }

    claim.set("consumed_at", new DateTime());
    $app.save(claim);

    const playerId = claim.get("player");
    const now = new DateTime();

    const session = new Record($app.findCollectionByNameOrId("sessions"));
    session.set("host", playerId);
    session.set("status", "ended");
    session.set("started_at", now);
    session.set("ended_at", now);
    session.set("qr_token", core.generateInviteToken());
    $app.save(session);

    const participant = new Record($app.findCollectionByNameOrId("session_participants"));
    participant.set("session", session.id);
    participant.set("player", playerId);
    participant.set("status", "present");
    participant.set("joined_at", now);
    $app.save(participant);

    const match = new Record($app.findCollectionByNameOrId("matches"));
    match.set("session", session.id);
    match.set("game", pilesGame.id);
    match.set("status", "voting");
    match.set("started_at", now);
    $app.save(match);

    const matchPlayer = new Record($app.findCollectionByNameOrId("match_players"));
    matchPlayer.set("match", match.id);
    matchPlayer.set("player", playerId);
    matchPlayer.set("won", placement === 1);
    if (placement) matchPlayer.set("placement", placement);
    $app.save(matchPlayer);

    // Separate update (not part of the create above) so match_finished.pb.js's
    // onRecordAfterUpdateSuccess transition guard actually fires.
    match.set("status", "done");
    match.set("ended_at", new DateTime());
    match.set("duration_seconds", 0);
    $app.save(match);

    console.log(`[piles_claim] credited player ${playerId}: placement=${placement} points=${points}`);
    return e.json(200, { ok: true });
  } catch (err) {
    console.log(`[piles_claim] error: ${err}`);
    return e.json(500, { ok: false, error: "internal error" });
  }
});
