# Session Manager

Web-app **mobile-first** para gestionar sesiones de juegos de mesa en reuniones presenciales. Los jugadores entran por QR, crean perfil con *passcode* de 4 dígitos (o patrón táctil), votan juegos, registran partidas y compiten por victorias, XP y logros generados por IA.

## Objetivo

Sentirse como una **herramienta-juego** en sí misma: la app acompaña la reunión, no la sustituye. Sonidos, logros con puns, niveles, XP por hostear, re-rolls: todo pensado para que el grupo se ría junto.

## Documentación

| Documento | Cuándo leerlo |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | **Empieza aquí** si vienes nuevo (humano o agente). Mapa del repo, invariantes, recetas. |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | Checklist tras cualquier cambio antes de commitear o desplegar. |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Qué se hizo en cada commit, en orden cronológico. |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Roles, flujos, reglas de sesión, votaciones, logros, XP. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, modelo de datos, decisiones técnicas y *trade-offs*. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Lightsail Ubuntu 1 GB + 2 GB swap, PM2, Nginx, Gemini key. |
| [docs/TODO.md](docs/TODO.md) | Checklist operativa pendiente para producción. |

## Resumen ejecutivo

- **Stack:** SvelteKit (PWA estática) + PocketBase v0.37.3 (backend + SQLite + Auth + Realtime + Storage) + Nginx (HTTPS) + Gemini API (`gemini-2.5-flash`) para logros generados al crear cada juego.
- **Hosting:** AWS Lightsail Ubuntu 1 GB + 2 GB swap, PM2 como process manager (compartido con otros proyectos del mismo VPS).
- **Despliegue:** GitHub Actions → `rsync` + `pm2 restart` (`scripts/deploy.sh` reproducible local y en CI).
- **Tests:** 227 unit + 12 integration (PocketBase real). Pipeline CI: `typecheck · svelte-check · vitest unit · vite build · check:migrations · check:hooks · check:types · vitest integration`.

## ¿Por qué este stack para ir rápido?

1. **PocketBase sustituye 5 servicios** (Auth, DB, API, Realtime, Storage) en un solo binario Go de ~30 MB. Lo que en Next+Postgres+Redis+S3 te costaría 2 semanas de *plumbing*, aquí son horas.
2. **SvelteKit estático** se sirve con Caddy sin runtime Node en producción → cero overhead de RAM por el frontend.
3. **SQLite** en un disco SSD rinde de sobra para un grupo de <100 jugadores simultáneos — que es el caso real.
4. **Claude API** evita montar infra de IA; los logros se generan una sola vez por juego y se cachean en DB.

Ver [ARCHITECTURE.md §Decisiones](docs/ARCHITECTURE.md#decisiones-clave-adr-lite) para las alternativas descartadas y por qué.
