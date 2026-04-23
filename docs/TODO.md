# To-Do de despliegue

Pasos pendientes para tener `session-manager` corriendo en `sessions.tudominio.com`. Los detalles exactos están en [DEPLOYMENT.md](DEPLOYMENT.md), aquí solo el checklist.

## 1. Red / DNS
- [x] Subdominio en Cloudflare apuntando a la IP estática de Lightsail (DNS only mientras Certbot emite el cert).

## 2. Lightsail
- [x] Instancia Ubuntu 22.04 / 24.04 (1 GB RAM, 40 GB SSD).
- [ ] Static IP adjunta a la instancia.
- [ ] Firewall de Lightsail (consola Networking) abre 22/80/443.
- [ ] Swap de 2 GB activo (`free -h` muestra `Swap: 2.0Gi`).

## 3. Software base
- [ ] `nginx`, `certbot`, `unzip`, `ufw`, `rsync` instalados.
- [ ] PM2 corriendo bajo el usuario `ubuntu` con `pm2 startup` configurado.

## 4. Proyecto
- [ ] `/home/ubuntu/session-manager/` con subcarpetas `frontend/`, `pb_data/`, `pb_hooks/`, `pb_migrations/`.
- [ ] Binario PocketBase **v0.37.3** descargado (versiones < 0.23 fallan con la migración generada).
- [ ] **GEMINI_API_KEY** obtenida de <https://aistudio.google.com/app/apikey>.
- [ ] PocketBase corriendo bajo PM2 como `session-manager-pb`, con la `GEMINI_API_KEY` inyectada.
- [ ] Superuser de PocketBase creado para acceder al panel `/_/`.

## 5. Nginx + SSL
- [ ] Server block en `/etc/nginx/sites-available/session-manager` con proxy a `127.0.0.1:8090` para `/api/` y `/_/` (con `proxy_buffering off` para SSE).
- [ ] `certbot --nginx -d sessions.tudominio.com` emite el certificado.

## 6. Primer despliegue
- [ ] `npm run build:migrations`, `build:hooks`, `build:types`, `build` corren limpios localmente.
- [ ] `rsync` de `build/`, `pb_hooks/`, `pb_migrations/` al servidor.
- [ ] `pm2 restart session-manager-pb` y `/api/health` responde 200.

## 7. CI/CD (opcional)
- [ ] Secrets/variables de GitHub: `SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER=ubuntu`, `DEPLOY_APP_DIR=/home/ubuntu/session-manager`.
- [ ] Push a `main` dispara `deploy.yml` tras CI verde.

## 8. Verificación
- [ ] Pasar el checklist de [VERIFICATION.md](VERIFICATION.md) al menos una vez tras el primer deploy.
