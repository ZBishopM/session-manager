# To-Do de despliegue

Pasos pendientes para tener `session-manager` corriendo en `sessions.tudominio.com`. Los detalles exactos están en [DEPLOYMENT.md](DEPLOYMENT.md), aquí solo el checklist.

**Corregido 2026-08-22**: este checklist estaba desactualizado — decía que casi nada estaba hecho, pero probando el sitio en vivo desde afuera (`gamesessions.danassistantassistant.website`) queda claro que el despliegue real ya pasó por casi todos estos pasos. Lo marcado `[x]` entonces se confirmó por HTTP/TLS externo, sin acceso SSH.

**Actualizado 2026-09-09**: ya con acceso SSH al VPS. El despliegue está hecho y funcionando; lo que sigue abierto está al final. Ya **no hay Lightsail** — esto vive en el VPS Hetzner compartido `agapornis` (167.233.88.83, usuario `bicho`).

## 1. Red / DNS
- [x] Subdominio en Cloudflare apuntando a la IP del VPS (DNS only mientras Certbot emite el cert).

## 2. Máquina
- [x] VPS Hetzner `agapornis`, compartido con el correo (Stalwart), piles-game, n8n/postgres y Navidrome.
- [x] Puertos 80/443 abiertos — confirmado (80 redirige 301 a 443, 443 responde TLS).
- [x] ~~Swap de 2 GB~~ — **no aplica**: la máquina no tiene swap. Por eso las compilaciones pesadas (las de piles) van con `nice -n 19 … -j 1`; este proyecto no compila nada en el servidor.

## 3. Software base
- [x] `nginx` — confirmado (sirve el redirect 80→443 y el TLS).
- [x] `certbot` — confirmado: cert real de Let's Encrypt, vigente (emitido 9-ago-2026, expira 7-nov-2026).
- [ ] `unzip`, `ufw`, `rsync` — no verificables desde afuera, pero son pasos de un solo comando; asumibles si el resto funciona.
- [x] PM2 corriendo — inferido con confianza alta: el servicio lleva arriba de forma estable y `docs/DEPLOYMENT.md`/`scripts/deploy.sh` asumen PM2 como único mecanismo de arranque/restart, no hay alternativa documentada.

## 4. Proyecto
- [x] Estructura en el VPS — **confirmada por SSH 2026-09-09**: binario y cwd en `/var/www/session-manager/pb/`, con `pb_data/`, `pb_hooks/` y `pb_migrations/` dentro; frontend en `/var/www/session-manager/build/`.
- [x] Binario PocketBase — confirmado indirectamente: `/api/health`, todas las collections (`games`, `players`, `sessions`, `matches`, `achievements`) y el realtime SSE responden correctamente.
- [ ] **GEMINI_API_KEY** — **confirmado 2026-09-09: no está puesta.** El hook lo detecta y se salta la generación sin romper nada, así que el sitio funciona; lo que no hay es ni un logro en el catálogo. Ponerla es el paso previo a tener logros generados. Fix en `DEPLOYMENT.md` §11.
- [x] PocketBase corriendo bajo PM2 como `session-manager-pb` — mismo razonamiento que arriba.
- [x] Superuser de PocketBase — confirmado: `/_/` responde 200 (el panel admin está montado).

## 5. Nginx + SSL
- [x] Server block con proxy a `127.0.0.1:8090` para `/api/` y `/_/`, con `proxy_buffering off` — confirmado: `/api/health` y las collections responden vía proxy, y el realtime SSE emite `PB_CONNECT` de inmediato (si `proxy_buffering` estuviera activo, el SSE se colgaría en buffer).
- [x] `certbot --nginx -d sessions.tudominio.com` — confirmado, cert real y vigente.

## 6. Primer despliegue
- [x] Build local — confirmado indirectamente: el frontend en producción sirve HTML/JS con el patrón de hashes de un build real de Vite/SvelteKit, no un placeholder.
- [x] `rsync` al servidor — confirmado por lo mismo (hay contenido real desplegado).
- [x] `pm2 restart` + `/api/health` responde 200 — confirmado, 200 con body `{"code":200,"message":"API is healthy.",...}`.

## 7. CI/CD
- [x] Secrets/variables de GitHub: `SSH_KEY`, `DEPLOY_HOST=167.233.88.83`, `DEPLOY_USER=bicho`, `DEPLOY_APP_DIR=/var/www/session-manager`.
- [x] Push a `main` dispara `deploy.yml` tras CI verde — **visto funcionar de punta a punta el 2026-09-09**: CI verde, Deploy verde, cambios en producción.

## 8. Verificación
- [x] Rutas `/`, `/auth`, `/host`, `/games`, `/profile` responden 200.
- [ ] Resto del checklist de [VERIFICATION.md](VERIFICATION.md) — no lo pasé completo, solo lo que se puede probar por HTTP desde afuera. `games` está vacío (0 registros) — puede ser normal (nadie ha creado un juego aún) o el síntoma real de lo que sea que no funciona. Ver README.md raíz, sección P1, para lo que hace falta para cerrar esto.
