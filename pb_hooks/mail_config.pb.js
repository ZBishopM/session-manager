/// <reference path="../pb_data/types.d.ts" />
/**
 * Configures PocketBase's built-in SMTP mailer from env vars on startup,
 * so $app.newMailClient() (used by weekly_matchmaker.pb.js) can send
 * through the agapornis Stalwart mail server. Also points the "players"
 * collection's confirm-email-change link at our own /confirm-email route
 * instead of PocketBase's default (which links to the superuser admin
 * dashboard, `{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}` — not
 * reachable/appropriate for a regular player).
 *
 * PocketBase does not let a non-superuser set their own auth-collection
 * `email` via a plain record update (rejected server-side regardless of
 * payload, confirmed 2026-09-04) — changing it always requires this
 * request/confirm round trip: requestEmailChange() sends the link below,
 * the /confirm-email page collects the token + passcode and calls
 * confirmEmailChange(). See src/routes/profile/+page.svelte and
 * src/routes/confirm-email/+page.svelte.
 *
 * Env vars: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
 * SMTP_FROM, PUBLIC_URL — same "unset means disabled, logged once"
 * pattern as DISCORD_WEBHOOK_URL / GEMINI_API_KEY elsewhere in pb_hooks.
 */
onBootstrap((e) => {
  e.next();

  const publicUrl = $os.getenv("PUBLIC_URL");
  if (publicUrl) {
    const settings = $app.settings();
    settings.meta.appURL = publicUrl;
    settings.meta.appName = "Session Manager";
    $app.save(settings);

    const players = $app.findCollectionByNameOrId("players");
    players.confirmEmailChangeTemplate = {
      subject: "Confirma tu nuevo correo en Session Manager",
      body: [
        "<p>Hola,</p>",
        "<p>Confirma tu nuevo correo para notificaciones de matchmaking.</p>",
        '<p><a href="{APP_URL}/confirm-email?token={TOKEN}">Confirmar correo</a></p>',
        "<p>Si no pediste este cambio, ignora este mensaje.</p>",
      ].join("\n"),
    };
    $app.save(players);
  } else {
    console.log("[mail_config] PUBLIC_URL not set — email-change confirmation links will be broken");
  }

  const host = $os.getenv("SMTP_HOST");
  const password = $os.getenv("SMTP_PASSWORD");
  if (!host || !password) {
    console.log("[mail_config] SMTP_HOST/SMTP_PASSWORD not set — email notifications disabled");
    return;
  }

  const settings = $app.settings();
  settings.smtp.enabled = true;
  settings.smtp.host = host;
  settings.smtp.port = Number($os.getenv("SMTP_PORT") || "465");
  settings.smtp.username = $os.getenv("SMTP_USERNAME") || "";
  settings.smtp.password = password;
  settings.smtp.tls = true;
  settings.meta.senderAddress = $os.getenv("SMTP_FROM") || settings.smtp.username;
  settings.meta.senderName = "Session Manager";
  $app.save(settings);
  console.log("[mail_config] SMTP configured from env");
});
