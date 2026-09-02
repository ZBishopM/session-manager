# Features — testable user flows

What a real user can actually click through and do, grouped by area, each tagged with the version it showed up in. This is capability-oriented (what works), not commit-oriented — see `CHANGELOG.md` for the technical/commit history.

**Versioning**: no formal releases exist yet, so this file uses simple `vN` markers of its own, each tagged with the commit that shipped it.

**v1–v5 are all live** as of 2026-09-02 (commit `897d906`, deployed same day) — just use https://gamesessions.danassistantassistant.website, including from your phone.

To run a not-yet-deployed change locally instead:
```
npm install
npm run build:migrations && npm run build:hooks && npm run build:types
# then run a local PocketBase (see docs/DEPLOYMENT.md §4-6) with pb_hooks/ and
# pb_migrations/ from this checkout, and separately:
npm run dev
```
Or simpler for a quick look at just the PocketBase side: `npm run test:integration` spins up a real local PocketBase against the current schema/hooks (not the frontend, but confirms the backend is sound). `npm run test:e2e` goes one further: a real Chromium browser driven by Playwright against a real local PocketBase — the only layer that catches bugs involving actual browser behavior (autofill, native form validation, real navigation), which is exactly the class of bug in the fix right below.

---

## Account

- [x] **v1** — Sign up: nickname (2–24 chars, unique) + 4-digit passcode. `/auth`.
- [x] **v6 (live, `b3f3211`)** — **Bug fix.** Signup could fail with the browser's own native "usa el formato solicitado" (pattern-mismatch) message instead of anything the app controls. Root cause: the passcode field was `autocomplete="current-password"` even during signup — a password manager reading that attribute will happily offer to autofill an unrelated *saved* password from some other site, which then fails the 4-digit check. Fixed: `new-password` autocomplete in signup mode, all native browser validation disabled (`novalidate`) in favor of the app's own in-app hint, and the passcode value is sanitized on every keystroke (strips non-digits, caps at 4) so it can't drift regardless of how a value got typed, pasted, or autofilled in. Covered by both a component test (`AuthForm.test.ts`) and, for the first time in this repo, a real-browser E2E test (`tests/e2e/auth.spec.ts`, `npm run test:e2e`) that actually signs up, logs out, and logs back in against a real local PocketBase.
- [x] **v1** — Log in with nickname + passcode. `/auth`.
- [x] **v1** — Log out. `/profile`.
- [x] **v1** — View profile: nickname, level, XP bar, re-rolls count. `/profile`.
  - Re-rolls are **display-only** — nothing lets you spend one yet (see "Not yet possible" below).
- [x] **v1** — Landing page (`/`) shows "start session" + profile shortcuts once logged in, or the signup CTA if not. Note: it does **not** link to the game catalog — `/games` and `/games/new` exist but aren't in any nav, you have to type the URL.

## Game catalog

- [x] **v1** — Browse the catalog. `/games`.
- [x] **v1** — Add a game: name, min/max players, categories, description, image. `/games/new` (must be logged in).
  - Creating a game fires an AI call (Gemini) that generates achievements for it in the background. There's currently **no page that shows a game's achievements** — they're generated and stored, but not surfaced anywhere in the UI yet.

## Hosting a session

- [x] **v1** — Host creates a session: tap "Iniciar sesión" from the home screen → generates a session + a QR code + a join link. `/host`.
- [x] **v1** — Session console shows the lobby (status, participant count). `/session/[id]`.
- [x] **v2 (live, 897d906)** — **Actually starting play.** Before this, a session could never leave "created" status — there was no button anywhere to advance it. Now: once at least one player has joined, the host sees "Iniciar sesión" on `/session/[id]`, which creates the first match and flips the session to `active`.

## Joining a session

- [x] **v1** — Open a join link / scan a QR → resolves to the session and shows the lobby (status, participant count). `/join/[token]`.
  - **Known broken in v1** (live site today): the "Entrar a la sesión" button does nothing — no click handler existed. Scanning a QR gets you a read-only preview, not an actual join.
- [x] **v2 (live, 897d906)** — **Joining actually works now.** Tapping "Entrar a la sesión" creates a real participant record. If you're not logged in yet, it sends you to `/auth` first and brings you right back to finish joining afterward (works from `/join/[token]` or `/session/[id]` either way — same button, same behavior on both routes).
  - Also fixed: `session_participants`/`matches`/`votes` had superuser-only write permissions in the database itself — even a working button couldn't have joined anyone before this. Real players can now write to their own rows in all three.

## Weekly matchmaking — setting your availability

- [x] **v3 (live, 897d906)** — **New.** Set your standing weekly host/player availability. `/availability` (linked from `/profile`).
  - Pick a role (Host / Jugador), a weekday, and a time slot (morning/afternoon/evening/night).
  - As host: set how many people you can receive.
  - As player: optionally cap the max group size you're willing to join ("no me importa" is the default — no cap).
  - Add as many rows as you want (one per role+day+slot combo — posting the same combo twice is rejected). Each shows in a list below with a "Quitar" button to delete it.
  - This is standing/recurring — it's not "I'm free this specific Saturday," it's "I'm generally free Saturday afternoons." The matchmaker (below) reads this every week.

## Weekly matchmaking — the actual matching + notification

- [x] **v3 (live, 897d906 — backend only, no UI trigger)** — **New.** Every Sunday 18:00, a cron job (`pb_hooks/weekly_matchmaker.pb.js`) reads everyone's `/availability` rows, groups compatible host+player combinations per day/slot (host capacity and player group-size caps both respected — pure algorithm in `src/lib/core/matchmaking.ts`, 12 unit tests), creates a proposal, and posts one message per proposal to Discord with a personal accept/decline link per invited player.
  - **To test locally**: needs `DISCORD_WEBHOOK_URL` (a Discord channel webhook — same kind in_out already uses) and `PUBLIC_URL` (e.g. `http://localhost:5173`) set as env vars for the local PocketBase process. The cron won't fire until Sunday 18:00 by default — for a quick manual test, temporarily change the schedule string in `weekly_matchmaker.pb.js`'s `cronAdd("weekly-matchmaker", "0 18 * * 0", ...)` to `"* * * * *"` (every minute) and watch the Discord channel + stdout for `[weekly_matchmaker]` lines. Revert the schedule before committing.

## Weekly matchmaking — responding to an invite

- [x] **v4 (live, 897d906)** — **New.** Open the link a Discord invite message posted. `/invite/[token]`.
  - No login needed — the opaque token is the access grant (same idea as `sessions.qr_token`).
  - Shows who's hosting and when ("**ana** puede hostear sábado a la tarde — ¿te sumás?"), with **Acepto** / **No puedo** buttons.
  - Once you respond, the buttons are replaced by your answer — re-opening the same link later shows what you already said instead of letting you change it. (There's no "change my mind" flow yet — decline then re-accept isn't possible through the UI.)

## Weekly matchmaking — seeing all your invites in one place

- [x] **v5 (live, 897d906)** — **New.** `/profile` → "Mis invitaciones" → `/invites` (auth-guarded — this one needs login, unlike `/invite/[token]`, since it lists *all* of your invites rather than resolving one specific token).
  - Split into "Pendientes" (with the same Acepto/No puedo buttons, answerable right there — no need to dig up the original Discord link) and "Respondidas" (read-only history of what you already said).
  - Same underlying accept/decline write as `/invite/[token]` — this page just reads the token off your own invite record instead of it coming from the URL.

## Weekly matchmaking — host converts an accepted proposal into a real session

- [x] **v4 (live, 897d906)** — **New.** `/profile` → "Mis propuestas de la semana" → `/proposals`.
  - Lists your own proposals (as host) that are still open, each showing every invited player and their response (✓ acepta / no puede / esperando…).
  - "Crear sesión y mostrar QR" is disabled until at least one person has accepted. Clicking it creates a real session (same as `/host`'s "Crear sesión") and takes you straight to `/session/[id]` with the QR up — from there it's the exact same in-person gathering flow as v2 (players still scan the QR to actually join; accepting the invite online doesn't auto-join them — that's deliberate, the QR scan is what confirms someone actually showed up).

## Picking what to play

- [x] **v2 (live, 897d906)** — **Entirely new in v2 — didn't exist at all before.** Once the host starts the session, every joined player sees a game-voting screen (radio-button style, one game per row + a 🎲 "Aleatorio" option). Games shown are filtered to ones whose min/max player count fits how many people actually joined.
  - Once everyone who joined has voted, the pick resolves automatically: most votes wins; if "Aleatorio" wins, a random eligible game is drawn; **ties are broken by a random pick among the tied options** (not a host override — see "Not yet possible").
  - The resolved game then shows on `/session/[id]` for everyone instead of the voting screen.

## Weekly matchmaking — email channel

- [x] **v6 (live, 69e931d)** — **New.** Invite notifications now also go out by email, alongside Discord. `/profile` has a new "Correo para notificaciones de matchmaking" field to opt in — leave it blank and you just don't get emailed.
  - Backed by a real self-hosted mail server: Stalwart, running on the agapornis VPS at `mail.agapornis.app`, with its own domain (`agapornis.app`), real Let's Encrypt TLS (auto-renewing via ACME DNS-01 through Cloudflare), and SPF/DKIM/DMARC configured for deliverability.
  - `pb_hooks/mail_config.pb.js` configures PocketBase's built-in SMTP mailer from `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_FROM` env vars on startup (unset = email stays disabled, same "skip and log" pattern as the Discord webhook). `weekly_matchmaker.pb.js` sends one personal email per invited player who has an email set — same invite link as the Discord/in-app versions.
  - Verified end-to-end with a real send through the production mail server, delivered to a real inbox without landing in spam.

---

## Not yet possible (data model or component exists, but nothing wires it up)

These are real gaps, not just missing polish — worth knowing before you go looking for a button that isn't there:

- **Recording a match result** (who won, how long it took) — `MatchResultSheet.svelte` is fully built and tested but never imported into any route. A match can be voted on and get a game assigned, but nothing can ever mark it "done."
- **XP and achievement unlocks** — the hook that computes these (`match_finished.pb.js`) only fires when a match transitions to `status: "done"`, which per the point above can never actually happen through the UI today. So XP/achievements are wired end-to-end in the backend but currently unreachable from the app.
- **Achievement toasts** — `AchievementToast.svelte` is built and tested, never rendered anywhere.
- **Ending a session** (`sessions.status = "ended"`) — no button anywhere sets this.
- **Co-host assignment** — `sessions.co_host` field exists, nothing in the UI sets it.
- **Kicking a participant** — `session_participants.status` supports `"kicked"`, no UI action for it.
- **Spending a re-roll** — the count displays on `/profile`, nothing lets you use one.
- **Favorite categories** — field exists on the player record, no UI to set it.
- **Manual host tie-break on a vote tie** — per `docs/BUSINESS_RULES.md` a tie should let the host decide; v2 auto-resolves it by random pick instead (deliberate MVP simplification, not silently dropped — see `pendientes/gamesessions.md`).

## Coming next (per the matchmaking plan)

Full design in `C:\Users\obisp\.claude\plans\verify-what-s-missing-first-hashed-lovelace.md`. What's left, in build order:
- **Web Push channel** — Discord and email are both live now. Web Push needs a spike first: PocketBase hooks run in Goja, a restricted JS VM, and the standard VAPID-signing library may not run there at all — see `pendientes/gamesessions.md` for the fallback plan (relay through in_out's n8n instance) if so.
- **Also not yet possible, from v4/v5**: no way to change an invite response once given (decline → re-accept isn't wired), no expiry sweep for old proposals that never got enough acceptances (`status: "expired"` exists in the schema, nothing sets it).
