# Session Manager

Web-app **mobile-first** para gestionar sesiones de juegos de mesa en reuniones presenciales. Los jugadores entran por QR, crean perfil con *passcode* de 4 dígitos (o patrón táctil), votan juegos, registran partidas y compiten por victorias, XP y logros generados por IA.

## Objetivo

Sentirse como una **herramienta-juego** en sí misma: la app acompaña la reunión, no la sustituye. Sonidos, logros con puns, niveles, XP por hostear, re-rolls: todo pensado para que el grupo se ría junto.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Roles, flujos, reglas de sesión, votaciones, logros, XP |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, modelo de datos, decisiones técnicas y *trade-offs* |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | VPS 1 GB, CI/CD desde GitHub, operación |

## Resumen ejecutivo

- **Stack:** SvelteKit (PWA estática) + PocketBase (backend + SQLite + Auth + Realtime + Storage) + Caddy (HTTPS) + Claude API (Haiku 4.5) para logros.
- **Hosting:** 1 VPS Linux de 1 GB RAM (Hetzner CX22 / DigitalOcean / Contabo). Consumo esperado en reposo ~150 MB.
- **Despliegue:** GitHub Actions → `rsync`/`scp` + `systemd restart`. Sin Docker para ahorrar RAM.
- **Tiempo a MVP:** ~2–3 semanas part-time.

## ¿Por qué este stack para ir rápido?

1. **PocketBase sustituye 5 servicios** (Auth, DB, API, Realtime, Storage) en un solo binario Go de ~30 MB. Lo que en Next+Postgres+Redis+S3 te costaría 2 semanas de *plumbing*, aquí son horas.
2. **SvelteKit estático** se sirve con Caddy sin runtime Node en producción → cero overhead de RAM por el frontend.
3. **SQLite** en un disco SSD rinde de sobra para un grupo de <100 jugadores simultáneos — que es el caso real.
4. **Claude API** evita montar infra de IA; los logros se generan una sola vez por juego y se cachean en DB.

Ver [ARCHITECTURE.md §Decisiones](docs/ARCHITECTURE.md#decisiones-clave-adr-lite) para las alternativas descartadas y por qué.
