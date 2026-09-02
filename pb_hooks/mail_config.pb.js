/// <reference path="../pb_data/types.d.ts" />
/**
 * Configures PocketBase's built-in SMTP mailer from env vars on startup,
 * so $app.newMailClient() (used by weekly_matchmaker.pb.js) can send
 * through the agapornis Stalwart mail server.
 *
 * Env vars: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
 * SMTP_FROM — same "unset means disabled, logged once" pattern as
 * DISCORD_WEBHOOK_URL / GEMINI_API_KEY elsewhere in pb_hooks.
 */
onBootstrap((e) => {
  e.next();

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
