/// <reference path="../pb_data/types.d.ts" />
/**
 * When every expected participant has voted on the session's current
 * (voting) match, resolve the vote and set matches.game.
 *
 * Fires on every vote create/update — cheap to re-check each time since
 * a session's active-player count is small. Idempotent: does nothing if
 * the match already has a game set.
 *
 * All business logic lives in pb_hooks/_core.js (bundled from src/lib/core).
 * This hook is pure glue: read state, call core, write state.
 */

function tryCloseVoting(vote) {
  const matchId = vote.get("match");
  if (!matchId) return;

  const match = $app.findRecordById("matches", matchId);
  if (match.get("status") !== "voting" || match.get("game")) {
    return; // already resolved, or not in a votable state
  }

  const session = $app.findRecordById("sessions", match.get("session"));

  const expectedVoters = $app.findRecordsByFilter(
    "session_participants",
    `session = "${session.id}" && (status = "present" || status = "playing")`,
    "",
    200,
    0,
  );
  const expectedCount = expectedVoters.length;
  if (expectedCount === 0) return;

  const castVotes = $app.findRecordsByFilter(
    "votes",
    `match = "${matchId}"`,
    "",
    200,
    0,
  );

  // Only one vote per player is allowed by the unique(match, player) index,
  // so castVotes.length already reflects distinct voters.
  if (castVotes.length < expectedCount) return;

  const core = require(`${__hooks}/_core.js`);

  const votes = castVotes.map((v) => ({
    userId: v.get("player"),
    gameId: v.get("game") || core.RANDOM_VOTE,
  }));

  const participantCount = expectedCount;
  const eligibleGames = $app.findRecordsByFilter(
    "games",
    `min_players <= ${participantCount} && max_players >= ${participantCount}`,
    "",
    500,
    0,
  );
  const eligibleGameIds = eligibleGames.map((g) => g.id);

  const decision = core.decideVotes(votes, eligibleGameIds);
  if (decision.kind === "no_votes") return;

  match.set("game", decision.gameId);
  match.set("was_random", decision.kind === "random");
  $app.save(match);
}

onRecordAfterCreateSuccess((e) => {
  try {
    tryCloseVoting(e.record);
  } catch (err) {
    console.log(`[voting_closed] error: ${err}`);
  }
  e.next();
}, "votes");

onRecordAfterUpdateSuccess((e) => {
  try {
    tryCloseVoting(e.record);
  } catch (err) {
    console.log(`[voting_closed] error: ${err}`);
  }
  e.next();
}, "votes");
