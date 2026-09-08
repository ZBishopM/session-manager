/// <reference path="../pb_data/types.d.ts" />
/**
 * match_players y matches.update seguían siendo superuser-only, así que
 * desde el navegador NUNCA se pudo registrar el resultado de una partida:
 * handleRecordResult llamaba a match_players.create() como jugador normal y
 * PocketBase lo rechazaba. No se había notado porque los tests de
 * integración escriben como superusuario y los unitarios mockean PocketBase;
 * nada recorría este camino como un jugador de verdad.
 *
 * Ahora además hace falta para apuntarse a una partida: la fila de
 * match_players se crea al apuntarse, no al terminar.
 *
 * Se abre exactamente lo que necesita la consola de sesión:
 *   - crear/borrar tu propia fila = apuntarte y borrarte de una partida
 *   - actualizar filas = solo el anfitrión de esa sesión, que es quien
 *     registra el resultado
 *   - actualizar la partida (voting → playing → done) = solo el anfitrión
 */
migrate(
  (app) => {
    const matchPlayers = app.findCollectionByNameOrId("match_players");
    matchPlayers.createRule = "player = @request.auth.id";
    matchPlayers.deleteRule = "player = @request.auth.id";
    matchPlayers.updateRule = "match.session.host = @request.auth.id";
    app.save(matchPlayers);

    const matches = app.findCollectionByNameOrId("matches");
    matches.updateRule = "session.host = @request.auth.id";
    app.save(matches);
  },
  (app) => {
    const matchPlayers = app.findCollectionByNameOrId("match_players");
    matchPlayers.createRule = null;
    matchPlayers.deleteRule = null;
    matchPlayers.updateRule = null;
    app.save(matchPlayers);

    const matches = app.findCollectionByNameOrId("matches");
    matches.updateRule = null;
    app.save(matches);
  },
);
