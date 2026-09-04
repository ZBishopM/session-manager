# Verificación post-cambio

Checklist para correr **después de cualquier cambio** (tuyo, de un agente, manual o por merge) y antes de pushear/desplegar. Si algo aquí no pasa, no merge.

Tiempo total: ~3-5 minutos en local, ~3 más para integración.

---

## A. El "smoke test rápido" (siempre)

Estos cuatro comandos deben terminar sin errores. Si uno falla, **investiga antes de seguir** — no te limites a re-intentar.

```bash
# 1. Type-check TS puro
pnpm run typecheck

# 2. Type-check Svelte (más estricto que tsc en bloques reactivos)
pnpm run check

# 3. Tests unit (espera ~10s, ~227+ tests)
pnpm test

# 4. Build estático (verifica que SvelteKit + Tailwind + PWA compilan)
pnpm run build
```

**Salida esperada del paso 3:**

```
Test Files  21 passed (21)
     Tests  227 passed (227)        ← el número exacto puede variar al añadir features
```

---

## B. Verificar que los archivos generados están en sync (siempre)

Tres pipelines distintos generan código que se commitea. Si alguno difiere del manifest, CI falla. Estos comandos regeneran y avisan si hay drift:

```bash
pnpm run check:migrations   # pb_migrations/1700000000_init.js  vs  schema.ts
pnpm run check:hooks        # pb_hooks/_core.js                 vs  hooks-entry.ts
pnpm run check:types        # src/lib/core/records.ts           vs  schema.ts
```

Cada uno corre el generador y luego `git diff --exit-code <archivo>`. **Si alguno reporta diff**, commiteá el archivo regenerado junto con tu cambio.

> Tip: si tocaste `src/lib/core/schema.ts` o agregaste algo a `hooks-entry.ts`, casi seguro hay drift y no te diste cuenta.

---

## C. Tests de integración (cuando tocaste schema, hooks o auth)

Levantan una instancia real de PocketBase contra los `pb_migrations/` y `pb_hooks/` actuales. Tarda ~30s la primera vez (descarga el binario), ~3s después.

```bash
pnpm run test:integration
```

**Salida esperada:**

```
Test Files  3 passed (3)
     Tests  12 passed (12)
```

Si quieres ver el stdout/stderr de PB durante el test (útil para debuggear hooks):

```bash
PB_DEBUG=1 pnpm run test:integration
```

**Cuándo SALTARSELOS está bien**: si tu cambio toca solo presentación (CSS/Tailwind, copy de UI, refactor de un componente sin cambiar su API). En cualquier otro caso, córrelos.

---

## D. Verificación visual (cambios de UI)

```bash
pnpm run dev
```

Abre <http://localhost:5173>, navega manualmente por:

- `/` → home muestra los CTAs correctos (signed-in vs signed-out).
- `/auth` → tabs login/signup, validación de nickname (≥2) y passcode (4 dígitos exactos).
- `/profile` → si no hay sesión, redirige a `/auth`.
- `/host` → botón crea sesión, aparece QR, código y link a `/session/[id]`.
- `/games` → lista (vacía la primera vez, "+ Nuevo juego" funciona).
- `/games/new` → form valida, redirige a `/games` tras guardar.
- `/join/<token-real>` → muestra el lobby con contador.

Para auth real necesitas PocketBase corriendo en local. Lo más simple:

```bash
# Una sola vez:
pnpm run fetch:pocketbase

# En otra terminal, desde la raíz:
./.pocketbase/0.37.3/pocketbase.exe serve \
  --http=127.0.0.1:8090 \
  --dir=./pb_data \
  --hooksDir=./pb_hooks \
  --migrationsDir=./pb_migrations
```

Y crea el primer superuser:

```bash
./.pocketbase/0.37.3/pocketbase.exe superuser upsert admin@local.test 12345678
```

(En Linux/Mac quita el `.exe`.)

---

## E. Antes de commitear

```bash
git status -s          # revisa qué archivos se mueven
git diff               # lee el diff
```

Asegúrate de incluir los **archivos generados regenerados** (`pb_hooks/_core.js`, `pb_migrations/1700000000_init.js`, `src/lib/core/records.ts`) si tu cambio los afectó. Si no los incluyes, CI te lo recuerda con un check fallido.

---

## F. Smoke test post-deploy (en producción)

Tras `git push` (o tras correr `bash scripts/deploy.sh` manualmente):

```bash
# Reemplaza la URL por la tuya
HOST=https://sessions.tudominio.com

curl -s "$HOST/api/health" | head -c 100   # debe contener "API is healthy"
curl -sI "$HOST/" | head -1                # debe ser 200
curl -sI "$HOST/manifest.webmanifest" | head -1   # 200
curl -sI "$HOST/sw.js" | head -1                  # 200

# En el VPS:
ssh ubuntu@TU-IP 'pm2 list'
# Esperado: session-manager-pb │ online │ uptime corto si acabas de redeploy
```

Y prueba el flujo crítico desde el navegador:

1. Crea un perfil en `/auth`.
2. Crea un juego en `/games/new` (descripción incluida — si la API key de Gemini está bien, en `pm2 logs` verás `[game_created] Saved 6 achievements for "<nombre>"` segundos después).
3. Verifica que aparece en `/games`.
4. Crea sesión en `/host`, escanea el QR con otro dispositivo, debería aterrizar en `/join/<token>` con la sesión visible.

---

## G. Cuándo escalar (señal de que algo se rompió fuera del repo)

Si **A.1-A.4 pasan** en local pero **CI falla**:
- Lee el log: `gh run view --log-failed` (o desde la web).
- Frecuente: es Node version mismatch, missing env var en CI, o checks que solo CI corre (`check:migrations` etc.).

Si **integration pasa local** pero **producción está caída**:
- Versión de PocketBase del VPS distinta de la del CI/local: `ssh ubuntu@TU-IP './pocketbase --version'` debe dar `0.37.3`.
- `GEMINI_API_KEY` no inyectada al proceso PM2: `pm2 logs session-manager-pb` mostrará `[game_created] GEMINI_API_KEY not set`.
- Nginx no está pasando SSE: revisar que el bloque tiene `proxy_buffering off` y `proxy_read_timeout 3600s`.

---

## Resumen ejecutivo

| Cambio | Mínimo a correr |
|---|---|
| CSS / copy / refactor cosmético | A1, A2, A4, D |
| Lógica en `src/lib/core/` | A1, A2, A3, B, C |
| Componente nuevo o cambiado | A1, A2, A3, D |
| `schema.ts` | A1, A2, A3, **B (todo)**, C |
| Hook nuevo (`pb_hooks/*.pb.js`) | A1, B, C |
| Cambio de modelo de IA / endpoint externo | A3, **C con stdout** (`PB_DEBUG=1`) |
| Despliegue | A1-A4, B, C, **F** |
