# Agent handoff

Lee esto **antes de tocar el código**. Te ahorra ~30 min de exploración y evita romper invariantes que no son obvios desde la estructura del repo.

## TL;DR del estado

- App **mobile-first** para gestionar sesiones de juegos de mesa (ver [BUSINESS_RULES.md](BUSINESS_RULES.md)).
- Stack: **SvelteKit** estático (frontend) + **PocketBase v0.37.3** (DB + auth + realtime + storage + hooks JS) + **Gemini 2.5 Flash** (genera logros al crear un juego).
- Despliegue: **AWS Lightsail Ubuntu**, 1 GB RAM + 2 GB swap, **PM2** + **Nginx** + Certbot. Detalle en [DEPLOYMENT.md](DEPLOYMENT.md).
- **227 unit tests + 12 integration tests** (a la fecha). El proyecto es estrictamente test-driven; **antes de aceptar un cambio sigue [VERIFICATION.md](VERIFICATION.md)**.

## Mapa del repo

```
session-manager/
├── docs/                       ← lee primero: README, ARCH, BUSINESS, DEPLOY, este HANDOFF, VERIFICATION, CHANGELOG, TODO
├── src/
│   ├── lib/
│   │   ├── core/               ← LÓGICA PURA, dependency-free. SOURCE OF TRUTH.
│   │   │   ├── schema.ts       ← manifest de colecciones PB (toca aquí, no la migración)
│   │   │   ├── awards.ts       ← XP + achievement unlocks por partida
│   │   │   ├── voting.ts       ← resolución de votos
│   │   │   ├── achievements.ts ← evaluador de triggers (DSL propio, sin eval)
│   │   │   ├── achievement-generator.ts ← prompt + parser para Gemini
│   │   │   ├── xp.ts · passcode.ts · hooks-entry.ts (re-exports al bundle)
│   │   │   └── records.ts      ← GENERADO desde schema.ts (no editar a mano)
│   │   ├── components/         ← Svelte components (.svelte) y .types.ts
│   │   ├── stores/             ← Svelte stores (user)
│   │   ├── auth.ts · pb.ts · qr.ts · pwa-config.ts
│   │   └── vitest-setup.ts
│   ├── routes/                 ← SvelteKit pages
│   │   ├── +layout.svelte · +page.svelte
│   │   ├── auth/ · profile/ · host/ · session/[id]/ · join/[token]/
│   │   └── games/ · games/new/
│   ├── app.css · app.html · app.d.ts
├── pb_hooks/                   ← Goja JS hooks. _core.js es GENERADO por esbuild.
│   ├── _core.js                ← bundle de hooks-entry.ts (no editar)
│   ├── package.json            ← {"type":"commonjs"} (solo afecta Node en tests)
│   ├── match_finished.pb.js · game_created.pb.js
├── pb_migrations/              ← Generadas. Solo se edita schema.ts y se regenera.
│   └── 1700000000_init.js      ← GENERADO
├── scripts/
│   ├── build-migrations.ts · build-hooks.ts · build-types.ts
│   ├── fetch-pocketbase.ts · deploy.sh
│   └── *.test.ts               ← cada generador tiene tests unitarios
├── tests/integration/          ← levantan PocketBase real
├── static/icons/               ← icon.svg + icon-maskable.svg para la PWA
├── .pocketbase/                ← cache del binario, gitignored
├── package.json · vite.config.ts · vitest.integration.config.ts · svelte.config.js · tsconfig.json
└── .github/workflows/ci.yml · deploy.yml
```

## Invariantes que NO debes romper

1. **El schema vive en `src/lib/core/schema.ts`.** No edites `pb_migrations/*.js` ni `src/lib/core/records.ts` a mano. Cambia el manifest y corre `npm run build:migrations && npm run build:types`. CI revienta si commiteas drift.
2. **Los hooks JS no importan TS directamente.** Toda la lógica reutilizable se exporta desde `src/lib/core/hooks-entry.ts`, esbuild la bundlea a `pb_hooks/_core.js` (CJS, target es2020). Si añades una función al hook, exportarla desde `hooks-entry.ts` y correr `npm run build:hooks`.
3. **Los hooks de PocketBase v0.23+ requieren `e.next()`** al final del callback. Sin él la cadena de eventos se corta y los siguientes hooks no se ejecutan. Wrappear en try/catch y loguear errores con `console.log` (van a stdout de PB y los ve PM2).
4. **Los triggers de achievements pasan por nuestro DSL** (`evaluateTrigger` en `achievements.ts`), nunca `eval()` ni `Function()`. La salida de la IA se valida ANTES de persistirse. Si extiendes el DSL, añade tests en `achievements.test.ts` cubriendo el rechazo de input no permitido.
5. **`liked` no es bool**. Es un `select` con valores `"like"`/`"dislike"`/`""`. PocketBase defaultea bool a `false`, lo que sería indistinguible de "votó 👎".
6. **`users` está renombrado a `players`** porque PocketBase v0.23+ trae una colección `users` por defecto que choca con la nuestra. Toda referencia (rutas, hooks, tests, schema) usa `players`.
7. **Generated files se commitean.** `pb_migrations/`, `pb_hooks/_core.js`, `src/lib/core/records.ts` están en git porque CI corre `check:migrations`/`check:hooks`/`check:types` y falla si el repo no refleja al manifest tras regenerar.

## Convenciones que vale la pena seguir

- **Código pura ↔ glue**: la lógica de negocio vive en `src/lib/core/*` (sync, sin dependencias, testeable a 100%). Los hooks PocketBase y las páginas Svelte son glue: leen estado, llaman al core, escriben estado.
- **Testing-library/svelte v5 + Svelte 4**: `onMount` no dispara de forma fiable bajo vitest. Si necesitas algo al montar el componente, usa un bloque reactivo `$:` (corre síncrono al init) — es el patrón en `AchievementToast.svelte`.
- **Tipos exportados desde .svelte**: el compilador de Svelte 4 no surfacea `export type` desde `<script lang="ts">`. Si tu componente tiene una interface pública, ponla en un `Componente.types.ts` colocado al lado.
- **Tests de componentes**: usar `data-testid="..."` siempre, y `aria-*` cuando aplique. Un test debe sobrevivir a refactors de Tailwind.
- **Comentarios**: solo donde el "por qué" no es obvio. Casi todos los comentarios actuales explican un quirk de PB, Svelte o jsdom.

## Comandos esenciales

| Para… | Corre… |
|---|---|
| Ver qué cambia ahora mismo | `git status -s` y `git diff` |
| Verificación completa local | sigue [VERIFICATION.md](VERIFICATION.md) (5 minutos) |
| Tests unit rápido | `npm test` |
| Tests integration (descarga binario PB si falta) | `npm run test:integration` |
| Type-check Svelte estricto | `npm run check` |
| Type-check TS puro | `npm run typecheck` |
| Build estático | `npm run build` |
| Regenerar artefactos del manifest | `npm run build:migrations && npm run build:hooks && npm run build:types` |
| Verificar que generados no driften | `npm run check:migrations && npm run check:hooks && npm run check:types` |
| Desplegar a VPS | `VPS_HOST=<ip> bash scripts/deploy.sh` |

## Cómo añadir cosas (recetas comunes)

### Añadir un campo a una colección
1. Editar `src/lib/core/schema.ts`.
2. `npm run build:migrations && npm run build:types`.
3. **Para infra existente**: PocketBase NO migra automáticamente cambios de campos en una migración ya aplicada. Hay que crear una migración nueva (el generador actual solo emite la `init`). Para MVP simplemente borra `pb_data/data.db` en local y deja que se reaplique.
4. `npm test` y `npm run test:integration`.

### Añadir un nuevo pb_hook
1. Crear `pb_hooks/<name>.pb.js` siguiendo el patrón de `match_finished.pb.js`: try/catch wrapper, `e.next()` al final, `require(\`${__hooks}/_core.js\`)` para acceder a la lógica pura.
2. Si necesitas exponer una función al hook, exportarla desde `src/lib/core/hooks-entry.ts` y correr `npm run build:hooks`.
3. Añadir un test de integración en `tests/integration/<feature>.integration.test.ts` que cree datos vía API REST, dispare el evento y verifique los efectos.

### Añadir una ruta SvelteKit
1. `src/routes/<path>/+page.svelte`.
2. Si requiere auth: importa `isAuthenticated` y `goto("/auth")` en `onMount`.
3. Para datos del backend: usa `collection("<name>")` desde `$lib/pb.js` — viene tipada por `CollectionRecordMap`.
4. Componentes nuevos van en `src/lib/components/<Name>.svelte` con su `<Name>.test.ts` al lado.

### Cambiar el modelo de IA
- El prompt y parser viven en `src/lib/core/achievement-generator.ts`. La constante `ACHIEVEMENTS_MODEL_DEFAULT` y la función `buildGeminiRequest` definen el contrato con la API.
- Si vuelves a Anthropic, mira el commit `2be0e1c` por el patrón previo.
- Si saltas a otro proveedor, ajusta también el endpoint en `pb_hooks/game_created.pb.js`.

## Pendiente (prioridad alta → baja)

1. **Realtime en `/session/[id]`**: contador de participantes, votación viva, toasts de logro tras cada partida. PocketBase ya emite SSE — usar `pb.collection(...).subscribe("*", cb)`.
2. **Consola del host enriquecida**: asignar/aleatorizar co-host, expulsar participantes, iniciar/terminar sesión, lanzar nueva partida (crea un `match` con `status="voting"`).
3. **Flujo de votación end-to-end**: integrar `<VoteSheet />` con `core.resolveVotes()`, mostrar tie-break al host.
4. **Re-roll consumible**: gastar `players.re_rolls` cuando ganó "aleatorio" para sortear de nuevo (lógica en `voting.ts` ya soporta el flag, falta UI).
5. **Subida de imágenes de juegos**: `<input type="file">` en `/games/new` enviado al campo `image` de la colección.
6. **PatternPad como input de auth**: actualmente `AuthForm` usa input numérico; sustituir por `<PatternPad />` cuando el patrón está habilitado.
7. **Migraciones incrementales**: `scripts/build-migrations.ts` solo emite la `init`. Para producción a futuro hace falta soportar deltas.
8. **Email/recovery**: el spec acepta no tener recovery (grupo cerrado). Si se necesita, habilitar `passwordAuth` con email opcional.

## Errores conocidos / pendientes de pulir

- **`onMount` flakiness en tests**: documentado arriba; usa `$:` cuando necesites efectos al init de un componente.
- **Cleanup entre renders**: registrado en `vitest-setup.ts` (`afterEach(cleanup)`). Si ves "Found multiple elements", probablemente estás haciendo `rerender` — usa renders separados con `unmount()`.
- **PWA no se actualiza al instante**: `registerType: "autoUpdate"` recarga al siguiente nav. Si quieres prompt manual, cambiar a `"prompt"` en `pwa-config.ts`.
- **PB hooks no muestran logs en CI a menos que falle algo**: el harness los captura siempre. Para verlos en local: `PB_DEBUG=1 npm run test:integration`.
