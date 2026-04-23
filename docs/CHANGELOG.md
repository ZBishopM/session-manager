# Changelog

Historial cronológico (más reciente arriba) de los commits significativos. Cada línea = un commit en `main` con su SHA corto, su entregable y el delta de tests.

## En curso (sin commitear todavía)

- **Pivot a Gemini para generación de logros**: `achievement-generator.ts` ahora exporta `buildGeminiRequest`/`extractGeminiText` y apunta a `gemini-2.5-flash` (`generativelanguage.googleapis.com/v1beta/models/.../generateContent`). El hook `pb_hooks/game_created.pb.js` lee `GEMINI_API_KEY`. Bundle `pb_hooks/_core.js` regenerado.
- 17 tests del generador (de 20): se quitaron los 3 específicos de la API de Anthropic (cache_control, anthropic-beta, override de modelo).
- `docs/DEPLOYMENT.md` reescrito para AWS Lightsail Ubuntu + 2 GB swap + PM2 + Nginx + Gemini key.
- `docs/TODO.md` actualizado al nuevo flujo.
- `scripts/deploy.sh` apunta a `ubuntu@/home/ubuntu/session-manager` y reinicia con `pm2 restart session-manager-pb`.
- Total tests: **227 unit + 12 integration** (todos verdes).

## c660cd2 — feat(deploy): scripts/deploy.sh + GitHub Actions workflow
Script `deploy.sh` reproducible (regenera artefactos del manifest, `vite build`, `rsync` + restart). Workflow `deploy.yml` corre tras CI verde, se salta si `DEPLOY_HOST` no está definido.

## aa1e83c — feat(catalog): /games + /games/new
`<GameCard>` (3 tests). `/games` lista juegos con sus categorías. `/games/new` crea juego (auth-guarded) y dispara el hook `game_created`. **+3 tests → 230**.

## f00d837 — feat(host): /host + /session/[id]
`src/lib/qr.ts` con generador de tokens 16-char URL-safe, composer de URL y SVG QR (7 tests). `<QrCode>`. `/host` crea sesión + muestra QR. `/session/[id]` reutiliza `<SessionLobby>`. **+7 → 227**.

## 8172ca1 — feat(auth): signup/login + /auth + /profile
`src/lib/auth.ts` (signup/login/logout/currentUser). Store `user`. `<AuthForm>` (9 tests, login/signup tabs, validación 4 dígitos). Rutas `/auth` y `/profile` (auth-guarded). Schema fix: `players.createRule = ""` para signup público. **+9 unit + 5 integration → 220 + 12**.

## 7b99073 — feat(ui): VoteSheet, MatchResultSheet, AchievementToast
Tres componentes core. `<VoteSheet>` (9 tests, radio-group con random). `<MatchResultSheet>` (9 tests, multi-winner para juegos por equipos, duración mm:ss). `<AchievementToast>` (9 tests, sonido Web Audio sintetizado, autodismiss vía `$:` reactivo en lugar de `onMount` por quirk de testing-library/svelte v5+Svelte 4). **+27 → 211**.

## eda1426 — feat(ui): tactile PatternPad
Grid 3×3 de puntos para el "passcode táctil" (10 tests). Bug encontrado: helper `indexOf(i)` ocultaba la dependencia reactiva de `points` al `{#each}` — refactor a `$: positions = …`. **+10 → 184**.

## 63ab24b — feat(frontend): Tailwind 4 + PWA instalable
Tailwind 4 (`@tailwindcss/vite`, design tokens en `@theme`). PWA via `@vite-pwa/sveltekit` (`autoUpdate` + `generateSW`, `/api/` denylist para que datos en vivo nunca se sirvan stale). Iconos SVG normal + maskable. 8 tests del manifest. **+8 → 174**.

## 41e9883 — fix(ci): svelte-check null narrowing + bump actions a Node 24
`svelte-check` (más estricto que `tsc` en bloques reactivos) no estrechaba `session` tras un await. Refactor a const local. Bump `actions/checkout@v6`, `actions/setup-node@v6`, `actions/cache@v5`.

## 10a4078 — feat(frontend): tipos generados + cliente PB + ruta /join/[token]
`scripts/build-types.ts` genera `src/lib/core/records.ts` (interfaces typadas por colección + `CollectionRecordMap`, 9 tests). CI corre `check:types`. `src/lib/pb.ts` envuelve el SDK con tipos. `<SessionLobby>` (8 tests). Ruta `/join/[token]`. **+22 → 166**.

## e609f6b — test(integration): real PocketBase end-to-end harness + 7 tests
`scripts/fetch-pocketbase.ts` cachea binario en `.pocketbase/<ver>/`. `tests/integration/harness.ts` levanta PB por test. Bumpeado a **PocketBase v0.37.3** y se forzaron muchas correcciones de schema:
- `users` → `players` (PB ya trae `users` por defecto).
- IDs estables `pbc_<name>` para colecciones (relaciones se resuelven por id no por nombre en v0.23+).
- System fields `id/created/updated` declarados explícitamente (PB v0.23+ ya no los auto-inyecta en colecciones JSON).
- `unique:true` se promueve a `CREATE UNIQUE INDEX` real (lo necesita `passwordAuth.identityFields`).
- Hooks: `e.next()` obligatorio, `record.original()` reemplaza `originalCopy()` de v0.22.
- `liked: bool` → `rating: select(['like','dislike'])` para distinguir "no votó" de "votó 👎".

**+7 integration → 145 unit + 7 integration**.

## 2be0e1c — feat(ai): Claude-generated achievements on game creation
*(Ahora migrado a Gemini, ver "En curso" arriba.)* `achievement-generator.ts` con `buildPrompt`/`buildClaudeRequest`/`extractClaudeText`/`parseAchievements` puros + 20 tests. `pb_hooks/game_created.pb.js` glue para `$http.send` a Anthropic. **+20 → 145**.

## 8bb6ac6 — feat(frontend): SvelteKit static scaffold + first tested component
SvelteKit 2 con `adapter-static`. Vitest unificado en `vite.config.ts`. `<XpBar>` (5 tests, ARIA). Build artifact = HTML/JS/CSS estáticos. **+5 → 125**.

## e203410 — feat(hooks): esbuild bundler + first PocketBase hook
`scripts/build-hooks.ts` bundlea `src/lib/core/hooks-entry.ts` → `pb_hooks/_core.js` CJS para Goja. `pb_hooks/match_finished.pb.js` glue que llama a `core.computeMatchAwards`. `pb_hooks/package.json` con `"type":"commonjs"` para que Node cargue el bundle en tests sin afectar a Goja. **+4 → 120**.

## e4441a3 — feat(awards): pure match-completion logic
`src/lib/core/awards.ts` con `computeMatchAwards` (XP por participar/ganar/ratear, evaluación de achievements contra stats post-match, idempotencia sobre ya-desbloqueados). 17 tests. **+17 → 116**.

## 55a0cd7 — feat(schema): typed PocketBase schema manifest with generated migration
`src/lib/core/schema.ts` como source-of-truth de las 10 colecciones. `validateSchema()` flagea violaciones (17 tests). `scripts/build-migrations.ts` produce `pb_migrations/1700000000_init.js` determinista (11 tests). CI: `check:migrations` falla si el archivo difiere. **+28 → 99**.

## a89c7aa — chore: scaffold repo with TDD core business logic
Repo, TS, Vitest, CI, `.gitignore`. Lógica pura inicial: `xp.ts` (curva 100·L^1.5), `voting.ts` (pluralidad + random), `achievements.ts` (DSL propio para triggers, sin `eval`), `passcode.ts` (canonicalización de patrones). **71 tests inicial**.

---

## Saltos de versión clave

- **PocketBase v0.22 → v0.37.3** (commit `e609f6b`): forzado por la API de migraciones JSON. Cualquier downgrade futuro requiere reescribir `scripts/build-migrations.ts`.
- **Anthropic Claude → Google Gemini** (en curso): cambio quirúrgico en `achievement-generator.ts` + el hook que lo invoca. La forma del request es muy distinta (Anthropic Messages API vs Gemini `generateContent`); si hay que volver atrás, los tests viejos están en el commit `2be0e1c`.
