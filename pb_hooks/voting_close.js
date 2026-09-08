/// <reference path="../pb_data/types.d.ts" />
/**
 * Cierre de la votación, en un módulo aparte a propósito.
 *
 * Cada handler del JSVM de PocketBase corre en una VM del pool, y el cuerpo
 * de la función se serializa solo: nada del ámbito superior del fichero de
 * hooks existe cuando el handler se ejecuta. Esto estuvo declarado como
 * `function tryCloseVoting()` en el nivel superior de voting_closed.pb.js y
 * cada voto reventaba con `ReferenceError: tryCloseVoting is not defined`,
 * tragado por el try/catch del hook: la votación no se cerraba nunca y la
 * partida se quedaba para siempre en "voting".
 *
 * Se carga con require() DENTRO del handler, igual que _core.js, que es el
 * único patrón que funciona aquí.
 *
 * El fichero NO acaba en `.pb.js` para que PocketBase no lo cargue como un
 * hook por su cuenta.
 */
module.exports = {
  /** Si ya han votado todos los presentes, elige juego y lo guarda. */
  tryCloseVoting(vote) {
    const matchId = vote.get("match");
    if (!matchId) return;

    const match = $app.findRecordById("matches", matchId);
    if (match.get("status") !== "voting" || match.get("game")) {
      return; // ya resuelta, o no está en estado votable
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

    const castVotes = $app.findRecordsByFilter("votes", `match = "${matchId}"`, "", 200, 0);

    // El índice único (match, player) garantiza un voto por jugador, así que
    // castVotes.length ya son votantes distintos.
    if (castVotes.length < expectedCount) return;

    const core = require(`${__hooks}/_core.js`);

    const votes = castVotes.map((v) => ({
      userId: v.get("player"),
      gameId: v.get("game") || core.RANDOM_VOTE,
    }));

    const eligibleGames = $app.findRecordsByFilter(
      "games",
      `min_players <= ${expectedCount} && max_players >= ${expectedCount}`,
      "",
      500,
      0,
    );

    const decision = core.decideVotes(votes, eligibleGames.map((g) => g.id));
    if (decision.kind === "no_votes") return;

    match.set("game", decision.gameId);
    match.set("was_random", decision.kind === "random");
    $app.save(match);
  },
};
