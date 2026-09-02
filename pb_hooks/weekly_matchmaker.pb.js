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
 */

const WEEKDAY_JS_DAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function nextOccurrence(weekday, now) {
  const targetDow = WEEKDAY_JS_DAY[weekday];
  const todayDow = now.getDay();
  const offsetDays = (targetDow - todayDow + 7) % 7;
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

function runWeeklyMatchmaker() {
  const core = require(`${__hooks}/_core.js`);

  const publicUrl = $os.getenv("PUBLIC_URL") || "https://CONFIGURE-PUBLIC-URL";
  if (!$os.getenv("PUBLIC_URL")) {
    console.log("[weekly_matchmaker] PUBLIC_URL not set — invite links will be broken");
  }
  const webhookUrl = $os.getenv("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) {
    console.log("[weekly_matchmaker] DISCORD_WEBHOOK_URL not set — skipping notifications this run");
  }

  const now = new Date();

  const availRecords = $app.findRecordsByFilter("availabilities", "", "", 2000, 0);
  const availabilities = availRecords.map((r) => ({
    id: r.id,
    player: r.get("player"),
    role: r.get("role"),
    weekday: r.get("weekday"),
    start_hour: r.get("start_hour"),
    end_hour: r.get("end_hour"),
    capacity: r.get("capacity") || undefined,
    max_group_size: r.get("max_group_size") || undefined,
  }));

  const groups = core.groupAvailabilities(availabilities);
  console.log(`[weekly_matchmaker] ${availabilities.length} availabilities -> ${groups.length} candidate groups`);

  const proposalsColl = $app.findCollectionByNameOrId("match_proposals");
  const invitesColl = $app.findCollectionByNameOrId("invites");

  for (const group of groups) {
    const proposedDate = nextOccurrence(group.weekday, now);
    const proposedDateIso = proposedDate.toISOString();

    const existing = $app.findRecordsByFilter(
      "match_proposals",
      `host = "${group.host}" && weekday = "${group.weekday}" && proposed_date = "${proposedDateIso}"`,
      "",
      1,
      0,
    );
    if (existing.length > 0) {
      continue; // already proposed this week for this host+slot
    }

    const proposal = new Record(proposalsColl);
    proposal.set("weekday", group.weekday);
    proposal.set("start_hour", group.start_hour);
    proposal.set("end_hour", group.end_hour);
    proposal.set("proposed_date", proposedDateIso);
    proposal.set("host", group.host);
    proposal.set("status", "proposed");
    $app.save(proposal);

    const hostPlayer = $app.findRecordById("players", group.host);
    const recipients = [];

    for (const playerId of group.players) {
      const token = core.generateInviteToken();
      const invite = new Record(invitesColl);
      invite.set("proposal", proposal.id);
      invite.set("player", playerId);
      invite.set("response", "pending");
      invite.set("invite_token", token);
      $app.save(invite);

      const playerRecord = $app.findRecordById("players", playerId);
      recipients.push({
        nickname: playerRecord.get("nickname"),
        url: `${publicUrl}/invite/${token}`,
        email: playerRecord.get("email"),
      });
    }

    if (webhookUrl && recipients.length > 0) {
      const message = core.buildDiscordMessage(
        { hostNickname: hostPlayer.get("nickname"), weekday: group.weekday, startHour: group.start_hour, endHour: group.end_hour },
        recipients,
      );
      try {
        $http.send({
          url: webhookUrl,
          method: "POST",
          timeout: 15,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: message }),
        });
      } catch (err) {
        console.log(`[weekly_matchmaker] Discord send failed: ${err}`);
      }
    }

    if ($app.settings().smtp.enabled) {
      for (const recipient of recipients) {
        if (!recipient.email) continue;
        const email = core.buildInviteEmail(
          { hostNickname: hostPlayer.get("nickname"), weekday: group.weekday, startHour: group.start_hour, endHour: group.end_hour },
          recipient,
        );
        try {
          const message = new MailerMessage({
            from: { address: $app.settings().meta.senderAddress, name: $app.settings().meta.senderName },
            to: [{ address: recipient.email }],
            subject: email.subject,
            html: email.html,
          });
          $app.newMailClient().send(message);
        } catch (err) {
          console.log(`[weekly_matchmaker] Email send to ${recipient.email} failed: ${err}`);
        }
      }
    }
  }
}

cronAdd("weekly-matchmaker", "0 18 * * 0", () => {
  try {
    runWeeklyMatchmaker();
  } catch (err) {
    console.log(`[weekly_matchmaker] error: ${err}`);
  }
});
