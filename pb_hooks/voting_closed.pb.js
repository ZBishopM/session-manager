/// <reference path="../pb_data/types.d.ts" />
/**
 * Cuando han votado todos los participantes esperados de la partida en
 * votación, resuelve el voto y fija matches.game.
 *
 * Se dispara en cada create/update de voto — recomprobar sale barato porque
 * una sesión tiene pocos jugadores. Idempotente: no hace nada si la partida
 * ya tiene juego.
 *
 * La lógica vive en voting_close.js y se carga con require() DENTRO de cada
 * handler. Tenerla como función en el nivel superior de este fichero NO
 * funciona: cada handler corre en una VM del pool donde ese ámbito no
 * existe, y fallaba con ReferenceError en cada voto.
 */

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/voting_close.js`).tryCloseVoting(e.record);
  } catch (err) {
    console.log(`[voting_closed] error: ${err}`);
  }
  e.next();
}, "votes");

onRecordAfterUpdateSuccess((e) => {
  try {
    require(`${__hooks}/voting_close.js`).tryCloseVoting(e.record);
  } catch (err) {
    console.log(`[voting_closed] error: ${err}`);
  }
  e.next();
}, "votes");
