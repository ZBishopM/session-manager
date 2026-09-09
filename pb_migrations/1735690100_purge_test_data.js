/// <reference path="../pb_data/types.d.ts" />
/**
 * Limpieza única de los restos que dejaron mis pruebas en PRODUCCIÓN.
 *
 * Nada de esto es una reunión real: son sesiones y partidas creadas para
 * verificar arreglos, más tres cuentas desechables. Se borran por id exacto,
 * verificados contra una copia de pb_data del 2026-09-08, para que si alguien
 * crea algo de verdad entre este commit y el despliegue no se toque.
 *
 * Los 10 XP de ZBishop vienen de la partida sintética que creó el claim de
 * Piles (`piles_claims.l2mda1r7lsq7ovg`, consumido a las 22:21:52.659 del
 * 2026-09-05; la sesión fa002… se creó en ese mismo milisegundo). Borrar la
 * partida NO los deshace: match_finished.pb.js desnormaliza el XP sobre el
 * jugador, así que hay que restarlos y recalcular el nivel a mano.
 *
 * La fila de piles_claims NO se borra: es el vínculo real de la cuenta con
 * Piles, no un resto de prueba.
 *
 * SIN VUELTA ATRÁS. El `down` no puede resucitar registros borrados y no lo
 * finge: la reversión es la copia de seguridad
 * `/var/www/session-manager/pb/pb_data.bak-20260908-163112` en el VPS.
 *
 * Se borran también tres cuentas de depuración más antiguas (del 2026-09-04):
 * no eran parte del acuerdo inicial, se preguntó al encontrarlas y entran.
 */

// Orden: primero lo que apunta a otras cosas.
const VOTES = ["jzk6dwnfh7j2bdc", "zkhh89nly5qdd5k"];
const MATCH_PLAYERS = ["4785xjjhm6gn8b9"];
const MATCHES = [
  "sp1t517rqhjlw7v", // partida sintética del claim de Piles
  "cxiw6r8kzasrf44",
  "shbj5n3pdmtrsdg",
  "8mndng6puj0fu99",
];
const SESSION_PARTICIPANTS = [
  "h77ehfp29m134zs",
  "o7tggv3u5a4agqt",
  "cwdfeqoib6l811d",
  "adavm4d07mz128m",
  "wt73pzudldpk5wg",
  "qnne64m6blcjnn1",
];
const SESSIONS = [
  "fa002kncwt0ll0w",
  "t96njk4idiwhsdr",
  "uwcx1wf1bxrqu60",
  "f5j31bd8xwfjnhm",
  "m0frk8nx65vmnwf",
  "bw4xiat47jteani",
  "jg0z64gwx4vjr6k",
];
const PLAYERS = [
  "izkfoxoiqqvegps", // zz_verify_1788890992038
  "53z23qsif58g7qu", // zz_h_1788891031287
  "fvqxvouay17y8h2", // zz_g_1788891031287
  // Cuentas de depuración más antiguas (2026-09-04): 0 XP, sin sesiones ni
  // partidas colgando de ellas.
  "94baz3zm1rxw5vo", // dbgtest1788559378
  "sacc1oowmuj09zs", // dbgtest2_1788559407
  "ig75r825s5e6bgv", // emailtest1788560387
];

const ZBISHOP = "z9w3590au7n0vkj";
const PHANTOM_XP = 10;

migrate(
  (app) => {
    const purge = (collection, ids) => {
      let removed = 0;
      for (const id of ids) {
        try {
          app.delete(app.findRecordById(collection, id));
          removed++;
        } catch (err) {
          // Ya borrado, o nunca estuvo en esta base (dev, tests, beta).
          // No es un fallo: la migración tiene que poder correr en cualquiera.
          console.log(`[purge_test_data] ${collection}/${id}: ${err}`);
        }
      }
      console.log(`[purge_test_data] ${collection}: ${removed}/${ids.length} borrados`);
    };

    purge("votes", VOTES);
    purge("match_players", MATCH_PLAYERS);
    purge("matches", MATCHES);
    purge("session_participants", SESSION_PARTICIPANTS);
    purge("sessions", SESSIONS);
    purge("players", PLAYERS);

    // Restar, no poner a cero: si ha jugado de verdad entre medias, ese XP
    // es suyo y se queda.
    try {
      const player = app.findRecordById("players", ZBISHOP);
      const xp = Math.max(0, (player.get("xp") || 0) - PHANTOM_XP);
      player.set("xp", xp);
      // levelFromXp(0) es 1 por definición. Para cualquier otro valor haría
      // falta la fórmula de _core.js, y no está confirmado que `require` y
      // `__hooks` existan en el contexto de una migración — así que en ese
      // caso se avisa en vez de calcular un nivel que podría estar mal.
      if (xp === 0) {
        player.set("level", 1);
      } else {
        console.log(`[purge_test_data] ${ZBISHOP} quedó con ${xp} XP: revisa el nivel a mano`);
      }
      app.save(player);
      console.log(`[purge_test_data] ${ZBISHOP}: xp -> ${xp}`);
    } catch (err) {
      console.log(`[purge_test_data] no se pudo ajustar el XP de ${ZBISHOP}: ${err}`);
    }
  },
  (_app) => {
    // Los registros borrados no vuelven. La copia de seguridad del VPS es la
    // única marcha atrás real; ver la cabecera.
  },
);
