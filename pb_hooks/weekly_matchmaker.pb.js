/// <reference path="../pb_data/types.d.ts" />
/**
 * Weekly matchmaking cron. Every Sunday, groups standing host/player
 * availability into candidate sessions, creates a match_proposals +
 * invites row per matched player, and notifies via Discord.
 *
 * All business logic lives in pb_hooks/_core.js (bundled from
 * src/lib/core). This hook is glue: read state, call core, write state,
 * send the notification.
 *
 * Env vars:
 *   DISCORD_WEBHOOK_URL — required to actually send; skipped (logged)
 *                         if unset, same pattern as GEMINI_API_KEY in
 *                         game_created.pb.js.
 *   PUBLIC_URL — site origin used to build /invite/[token] links, e.g.
 *                https://gamesessions.danassistantassistant.website.
 *                Falls back to a placeholder + a log line if unset, so
 *                a missing env var doesn't silently produce broken links.
 *
 * Email uses PocketBase's own mailer (configured by mail_config.pb.js
 * from SMTP_* env vars) rather than a separate webhook — sent only to
 * players who've set an email on their profile, one message per
 * recipient since each invite link is personal.
 *
 * La lógica vive en weekly_matchmaker.js y se carga con require() DENTRO
 * del callback del cron. Tenerla como función en el nivel superior de este
 * fichero NO funciona: el callback corre en una VM del pool donde ese
 * ámbito no existe, y el cron falló con ReferenceError cada domingo.
 */

cronAdd("weekly-matchmaker", "0 18 * * 0", () => {
  try {
    require(`${__hooks}/weekly_matchmaker.js`).runWeeklyMatchmaker();
  } catch (err) {
    console.log(`[weekly_matchmaker] error: ${err}`);
  }
});
