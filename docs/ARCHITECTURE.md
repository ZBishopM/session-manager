# Arquitectura

## Restricciones que mandan

1. **VPS 1 GB RAM** — cada MB cuenta. Descarta runtimes pesados (JVM, .NET, Next.js SSR en Node con muchas dependencias).
2. **Tiempo a MVP mínimo** — descarta construir *from scratch* auth/DB/realtime/storage.
3. **Mobile-first PWA** — debe funcionar offline-parcial y sentirse nativa.
4. **Un solo desarrollador** probablemente (inferido) — descarta arquitecturas distribuidas.
5. **Competitividad social** → realtime barato (contador de presentes, votación en vivo, logros compartidos).

## Stack elegido

```
┌─────────────────────────────────────────────────────────┐
│  Cliente: SvelteKit + Tailwind 4 + PWA (instalable)     │
│  Build estático servido por Nginx. Zero Node en prod.   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS + SSE (realtime)
┌────────────────────▼────────────────────────────────────┐
│  Nginx + Certbot (Let's Encrypt)                        │
│  - Sirve /home/ubuntu/session-manager/frontend/         │
│  - Proxy a 127.0.0.1:8090 en /api/* y /_/               │
│  - proxy_buffering off para SSE realtime                │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  PocketBase v0.37.3 bajo PM2                            │
│  - Auth (passcode bcrypt vía PB)                        │
│  - SQLite con WAL                                       │
│  - REST + Realtime (SSE)                                │
│  - File storage local (imágenes de juegos)              │
│  - Hooks en JS (pb_hooks/) para lógica server-side      │
└────────────────────┬────────────────────────────────────┘
                     │ solo al crear un juego nuevo
                     ▼
        ┌────────────────────────┐
        │  Google Gemini API     │
        │  gemini-2.5-flash      │
        │  (genera 6 logros)     │
        └────────────────────────┘
```

### Presupuesto de RAM en Lightsail 1 GB + 2 GB swap

| Componente | RAM aprox. |
|---|---|
| Kernel + systemd + SSH + agentes Lightsail | ~150 MB |
| Nginx | ~25 MB |
| PM2 daemon (compartido con Art Chat / Piles) | ~50 MB |
| PocketBase (idle) | ~40 MB |
| PocketBase (pico realtime ~20 clientes) | ~90 MB |
| Buffer SQLite + file cache Linux | ~200 MB |
| **Total en pico** | **~555 MB** |
| **Libre en RAM para otros servicios** | **~445 MB** |
| **Swap configurado (2 GB)** | absorbe picos build/IA |

`vm.swappiness=10` mantiene SQLite en RAM y solo paginiza presión real. Sin Docker (ahorra ~80 MB del daemon).

## Decisiones clave (ADR-lite)

### ADR-1: Backend → PocketBase, no Node+Postgres

**Alternativas consideradas:**
- Next.js + Prisma + Postgres + NextAuth + Socket.io + S3-compatible.
- Supabase (gestionado).
- Firebase.

**Elegido:** PocketBase.

**Razones:**
- Un solo binario: auth + DB + realtime + storage + admin UI. Menos código a escribir, menos cosas que mantener.
- Go idle ≈ 40 MB RAM vs Node+Postgres ≈ 250 MB.
- SQLite elimina un proceso; backup = `cp data.db data.db.bak`.
- Hooks en JS te dan lógica server-side sin desplegar otro servicio.
- No *vendor lock-in* (Supabase/Firebase) → todo vive en tu VPS.

**Trade-offs aceptados:**
- SQLite no escala horizontalmente. **Aceptable:** el caso de uso es reuniones de amigos, no 10k usuarios concurrentes. Si algún día hace falta, migrar a Postgres es mecánico.
- Menos ecosistema que Next.js. **Aceptable:** el ecosistema de PocketBase cubre el 95% aquí.

### ADR-2: Frontend → SvelteKit estático (adapter-static)

**Alternativas:** Next.js, Astro, React SPA, HTMX puro.

**Elegido:** SvelteKit con `@sveltejs/adapter-static`.

**Razones:**
- Bundle pequeño (~40-60 KB gz inicial) → mobile-first real en redes lentas.
- Componentes reactivos sin `useState`/`useEffect` — menos código.
- `adapter-static` genera HTML/JS/CSS → **no corre Node en prod**, Caddy lo sirve directo. 0 MB de RAM de frontend.
- PWA con `@vite-pwa/sveltekit` en una línea de config.
- Transitions/animaciones nativas del framework → logros y celebraciones sin librerías extra.

**Trade-offs:** SSR se sacrifica, pero el contenido es todo autenticado y no se indexa. No importa.

### ADR-3: Realtime → SSE nativo de PocketBase, no WebSockets custom

PocketBase emite *server-sent events* al cambiar un registro suscrito. Cubre:
- Contador de jugadores presentes en sesión.
- Estado de votación en vivo.
- Aparición de logros para todos.

Menos que WebSockets full-duplex, pero todo lo que necesitamos es push server→cliente. SSE reconecta solo, es HTTP estándar, atraviesa proxies sin configuración.

### ADR-4: IA de logros → llamada server-side bajo demanda, cacheada en DB

**No se llama a la API desde el cliente** (expondría la key). Se hace desde un *hook* de PocketBase (`onRecordAfterCreateSuccess` sobre la colección `games`) que:
1. Construye el prompt con los campos del juego.
2. Llama a Gemini `gemini-2.5-flash` (barato, rápido, free tier generoso).
3. Parsea JSON con `responseMimeType: "application/json"` para forzar formato.
4. Inserta filas en `achievements`. Si falla, el juego queda usable sin logros hasta que se regenere.

Originalmente el plan era Claude Haiku con prompt caching. Se migró a Gemini Flash 2.5 en abril 2026 por simplicidad de billing y free tier — el contrato del módulo (`buildPrompt` / `buildXRequest` / `extractXText` / `parseAchievements`) sigue siendo el mismo, solo cambiaron las dos funciones que hablan con la API. El commit `2be0e1c` tiene el patrón Anthropic si alguien quiere volver atrás.

### ADR-5: Sin Docker, gestionado por PM2

**Razón:** en 1 GB RAM, el daemon de Docker + overhead por contenedor supone ~80-120 MB que preferimos para la app. Desplegamos binarios nativos. PM2 ya está corriendo en el VPS para otros servicios (Art Chat, Piles), así que reusarlo evita meter `systemd unit` aparte. PM2 da arranque al boot, restart automático y logs centralizados.

Si el proyecto crece y pasa a 2+ VPS o Kubernetes, migrar a contenedores es trivial (PocketBase ya tiene imagen oficial).

### ADR-6: Passcode de 4 dígitos

Débil en abstracto, **adecuado al modelo de amenaza real** (grupo cerrado, sin datos sensibles). Mitigación: rate limit por IP+nickname, lockout temporal, logs. Documentado en `BUSINESS_RULES.md §2`.

## Modelo de datos (colecciones PocketBase)

```
users
  id, nickname (unique), passcode_hash, xp, level,
  favorite_categories (rel → categories[]),
  favorite_games (rel → games[]),
  re_rolls (int), created

categories
  id, name, icon

games
  id, name (unique), min_players, max_players,
  categories (rel → categories[]),
  image (file), description, owned_by (rel → users[]),
  created_by (rel → users), created

achievements
  id, game (rel → games), title, description,
  trigger_expr (text), rarity (enum), icon

sessions
  id, host (rel → users), co_host (rel → users),
  status (enum: created/active/ended),
  started_at, ended_at, qr_token

session_participants
  id, session (rel → sessions), user (rel → users),
  status (enum: present/playing/spectator/kicked/left),
  joined_at, left_at

matches
  id, session (rel → sessions), game (rel → games),
  started_at, ended_at, duration_seconds,
  was_random (bool)

match_players
  id, match (rel → matches), user (rel → users),
  won (bool), liked (null|true|false)

votes
  id, match (rel → matches), user (rel → users),
  game (rel → games | null if random)

user_achievements
  id, user (rel → users), achievement (rel → achievements),
  unlocked_at
```

Reglas de acceso en PocketBase:
- `users`: lectura pública de nickname/xp/level; passcode_hash nunca se expone.
- `sessions`: lectura para participantes; escritura solo host.
- `matches`/`match_players`: escritura solo co_host de la sesión.
- `games`/`categories`: lectura pública; escritura solo hosts (flag en user o verificación vía hook).

## Flujos críticos

### Unirse por QR

```
QR → https://app.tld/join/{session_qr_token}
  → SvelteKit resuelve token → muestra sesión
  → Si no hay user en localStorage → pantalla login/signup
  → POST /api/collections/session_participants/records
  → Suscripción SSE a cambios de la sesión
```

### Votación

```
Host pulsa "nueva partida" → crea match con status=voting
  → Jugadores votan (POST a votes)
  → Todos reciben actualizaciones vía SSE
  → Host cierra votación (timer o manual)
  → Hook server calcula ganador:
      - mayoría juego concreto → ese juego
      - mayoría aleatorio → sortea elegibles
      - empate → host decide en UI
```

### Desbloqueo de logro

```
Co-host registra resultado → PATCH match (status=done) + match_players
  → Hook onModelAfterUpdate evalúa trigger_expr de cada achievement
    del juego contra stats actualizadas del jugador
  → Inserta user_achievements si aplica
  → Emite evento por realtime → todos los dispositivos
    reproducen sonido + animación
```

## Observabilidad mínima (MVP)

- Logs de PocketBase a `journalctl`.
- Caddy access log rotado semanal.
- Healthcheck simple: `GET /api/health` (endpoint built-in de PocketBase).
- Backup diario de `pb_data/` a S3/Backblaze B2 (cron + `rclone`, <$0.50/mes).

No hay Prometheus/Grafana en MVP — añade ~150 MB RAM que no nos sobran. `htop` y logs bastan al principio.
