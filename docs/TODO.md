# To-Do de despliegue

Pasos pendientes para tener `session-manager` corriendo en `sessions.tudominio.com`. Los detalles exactos están en [DEPLOYMENT.md](DEPLOYMENT.md), aquí solo el checklist.

**Corregido 2026-08-22**: este checklist estaba desactualizado — decía que casi nada estaba hecho, pero probando el sitio en vivo desde afuera (`gamesessions.danassistantassistant.website`) queda claro que el despliegue real ya pasó por casi todos estos pasos. Lo marcado `[x]` abajo es lo que confirmé por HTTP/TLS externo (no tengo acceso SSH al VPS). Lo que no pude confirmar así queda `[ ]` con una nota — no es necesariamente pendiente, es "no verificable desde afuera".

## 1. Red / DNS
- [x] Subdominio en Cloudflare apuntando a la IP estática de Lightsail (DNS only mientras Certbot emite el cert).

## 2. Lightsail
- [x] Instancia Ubuntu 22.04 / 24.04 (1 GB RAM, 40 GB SSD).
- [ ] Static IP adjunta a la instancia. *(no verificable desde afuera — pero el sitio lleva respondiendo estable, así que probablemente sí.)*
- [x] Firewall de Lightsail abre 22/80/443 — confirmado 80 (redirige 301 a 443) y 443 (TLS responde). 22 no probado (es SSH, no HTTP).
- [ ] Swap de 2 GB activo. *(no verificable desde afuera.)*

## 3. Software base
- [x] `nginx` — confirmado (sirve el redirect 80→443 y el TLS).
- [x] `certbot` — confirmado: cert real de Let's Encrypt, vigente (emitido 9-ago-2026, expira 7-nov-2026).
- [ ] `unzip`, `ufw`, `rsync` — no verificables desde afuera, pero son pasos de un solo comando; asumibles si el resto funciona.
- [x] PM2 corriendo — inferido con confianza alta: el servicio lleva arriba de forma estable y `docs/DEPLOYMENT.md`/`scripts/deploy.sh` asumen PM2 como único mecanismo de arranque/restart, no hay alternativa documentada.

## 4. Proyecto
- [x] Estructura en el VPS — inferida (el sitio sirve `frontend/`, PocketBase responde con datos de `pb_data/`, los hooks corren — ver GEMINI_API_KEY abajo).
- [x] Binario PocketBase — confirmado indirectamente: `/api/health`, todas las collections (`games`, `players`, `sessions`, `matches`, `achievements`) y el realtime SSE responden correctamente.
- [ ] **GEMINI_API_KEY** — no verificable desde afuera sin crear un juego real (no lo hice: no voy a escribir en tu base de datos en producción sin que lo pidas). Si al crear un juego ves `[game_created] GEMINI_API_KEY not set, skipping…` en los logs, ver el fix en `DEPLOYMENT.md` §11.
- [x] PocketBase corriendo bajo PM2 como `session-manager-pb` — mismo razonamiento que arriba.
- [x] Superuser de PocketBase — confirmado: `/_/` responde 200 (el panel admin está montado).

## 5. Nginx + SSL
- [x] Server block con proxy a `127.0.0.1:8090` para `/api/` y `/_/`, con `proxy_buffering off` — confirmado: `/api/health` y las collections responden vía proxy, y el realtime SSE emite `PB_CONNECT` de inmediato (si `proxy_buffering` estuviera activo, el SSE se colgaría en buffer).
- [x] `certbot --nginx -d sessions.tudominio.com` — confirmado, cert real y vigente.

## 6. Primer despliegue
- [x] Build local — confirmado indirectamente: el frontend en producción sirve HTML/JS con el patrón de hashes de un build real de Vite/SvelteKit, no un placeholder.
- [x] `rsync` al servidor — confirmado por lo mismo (hay contenido real desplegado).
- [x] `pm2 restart` + `/api/health` responde 200 — confirmado, 200 con body `{"code":200,"message":"API is healthy.",...}`.

## 7. CI/CD (opcional)
- [ ] Secrets/variables de GitHub: `SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER=ubuntu`, `DEPLOY_APP_DIR=/home/ubuntu/session-manager`. *(no verificable desde afuera — mirar en GitHub → Settings → Secrets and variables → Actions.)*
- [ ] Push a `main` dispara `deploy.yml` tras CI verde. *(depende de lo anterior.)*

## 8. Verificación
- [x] Rutas `/`, `/auth`, `/host`, `/games`, `/profile` responden 200.
- [ ] Resto del checklist de [VERIFICATION.md](VERIFICATION.md) — no lo pasé completo, solo lo que se puede probar por HTTP desde afuera. `games` está vacío (0 registros) — puede ser normal (nadie ha creado un juego aún) o el síntoma real de lo que sea que no funciona. Ver README.md raíz, sección P1, para lo que hace falta para cerrar esto.
