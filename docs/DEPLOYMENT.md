# Despliegue y operación

> **Nota (2026-09-02):** este documento describe un setup desde cero en un Lightsail nuevo de 1 GB, pero el despliegue real terminó en un VPS Hetzner compartido ya existente ("agapornis", ~3.7 GB RAM, comparte máquina con art-chat-server, piles-game, n8n/postgres de in_out, Navidrome) — de hecho la §3 más abajo ya lo insinúa ("Si ya usabas el VPS para Art Chat / Piles..."), pero la §1 sigue framing todo como instancia nueva. Confirmado por recon SSH directo: usuario real `bicho` (no `ubuntu`), PocketBase corre desde `/var/www/session-manager/pb/` (sin flags `--hooksDir`/`--migrationsDir` — los toma relativos a su cwd), el frontend se sirve desde `/var/www/session-manager/build/`. `scripts/deploy.sh` ya está corregido a estas rutas reales. El resto de este documento (swap, nginx, certbot, cron de backup, etc.) no se re-verificó línea por línea contra la máquina real — tratarlo como referencia histórica/aspiracional para los pasos que no sean rutas, no como fuente de verdad 1:1. Ver `pendientes/gamesessions.md` para el hallazgo completo.

Stack en producción: **AWS Lightsail Ubuntu 1 GB RAM + 2 GB swap**, sin Docker, gestionado por **PM2** y expuesto vía **Nginx** con TLS de Let's Encrypt. La base de datos es SQLite embebida en PocketBase.

---

## 1. Crear la instancia en Lightsail (una sola vez)

1. Consola Lightsail → **Create instance**.
2. **Region:** la más cercana a tus jugadores.
3. **Platform:** Linux/Unix · **Blueprint:** OS Only · **Ubuntu 22.04 LTS** (o 24.04).
4. **Plan:** 1 GB RAM · 2 vCPU · 40 GB SSD (~$5/mes).
5. **Identify your instance:** `session-manager` (o lo que prefieras).
6. Tras crearla:
   - **Networking → Public IPv4 → Attach static IP** (gratis si está adjunta a la instancia, ~$3/mes si la dejas suelta).
   - **Networking → IPv4 Firewall** → añadir reglas para puertos `80/tcp` y `443/tcp`. SSH (22) viene por defecto. **Estos puertos se abren en la consola de Lightsail, no solo en `ufw`** — son dos firewalls independientes y ambos deben permitir el tráfico.

---

## 2. Configurar 2 GB de swap en la VPS

1 GB de RAM es justo. Con 2 GB de swap, picos puntuales (build, IA, restart) se absorben sin OOM-killer.

```bash
# Conéctate por SSH (Lightsail provee llave .pem o tu CLI):
ssh -i lightsail-key.pem ubuntu@TU-IP-PUBLICA

# Crear archivo swap de 2 GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Persistirlo en /etc/fstab para que se monte al reiniciar
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Reducir agresividad de swap (mejor para SQLite)
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system

# Verificar
free -h
# Esperado: Swap: 2.0Gi
```

---

## 3. Software base en la VPS (una sola vez)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx unzip ufw rsync

# UFW alineado con el firewall de Lightsail
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Si ya usabas el VPS para Art Chat / Piles, **PM2 y Node ya están instalados**. Si no:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Copia y ejecuta la línea sudo que PM2 imprime, para que arranque al boot.
```

---

## 4. Estructura del proyecto en el VPS

```bash
mkdir -p /home/ubuntu/session-manager/{frontend,pb_data,pb_hooks,pb_migrations}
cd /home/ubuntu/session-manager

# Bajar PocketBase v0.37.3 (la misma versión contra la que corren los integration tests)
PB_VER=0.37.3
curl -L -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VER}/pocketbase_${PB_VER}_linux_amd64.zip"
unzip pb.zip pocketbase
chmod +x pocketbase
rm pb.zip
```

> **Por qué v0.37.3:** la generación de migraciones del repo emite el formato JSON de v0.23+ (system fields explícitos `id/created/updated`, `passwordAuth.identityFields`, etc.). Versiones < 0.23 fallan al aplicar la migración.

---

## 5. Conseguir la API key de Gemini

1. Entra a <https://aistudio.google.com/app/apikey>.
2. **Create API key** → elige el proyecto de Google Cloud (el plan gratis cubre de sobra el caso de uso).
3. Copia la clave — la usas en el siguiente paso. **No la pegues en git.**

> El hook server-side (`pb_hooks/game_created.pb.js`) usa el modelo `gemini-2.5-flash` por defecto y solo llama a la API cuando alguien crea un juego en el catálogo, así que el coste es marginal.

---

## 6. Arrancar PocketBase con PM2

```bash
cd /home/ubuntu/session-manager

# Inyecta la GEMINI_API_KEY como variable de entorno del proceso
GEMINI_API_KEY="pega_tu_key_aqui" \
  pm2 start ./pocketbase \
    --name session-manager-pb \
    -- serve \
       --http=127.0.0.1:8090 \
       --dir=/home/ubuntu/session-manager/pb_data \
       --hooksDir=/home/ubuntu/session-manager/pb_hooks \
       --migrationsDir=/home/ubuntu/session-manager/pb_migrations

# Persistir la lista de procesos PM2 al boot
pm2 save
```

**Crear el superuser** (necesario para el panel admin en `/_/`):

```bash
./pocketbase superuser upsert tu-email@ejemplo.com TuPasswordSeguraDe10+
```

---

## 7. Nginx + HTTPS

`/etc/nginx/sites-available/session-manager`:

```nginx
server {
    listen 80;
    server_name sessions.tudominio.com;   # <- cámbialo

    # 1. Frontend estático (SvelteKit adapter-static)
    root /home/ubuntu/session-manager/frontend;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 2. PocketBase REST + admin panel + realtime (SSE)
    location ~ ^/(api|_)/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Realtime de PocketBase es Server-Sent Events: necesita
        # buffering desactivado y un timeout largo en el upstream.
        proxy_buffering        off;
        proxy_cache            off;
        proxy_read_timeout     3600s;
        proxy_send_timeout     3600s;
    }

    # 3. PWA: que el SW y el manifest no se cacheen agresivamente
    location = /sw.js               { add_header Cache-Control "no-store"; }
    location = /manifest.webmanifest { add_header Cache-Control "no-store"; }

    client_max_body_size 5M;   # subida de imágenes de juegos
}
```

Activar y certificar:

```bash
sudo ln -sf /etc/nginx/sites-available/session-manager /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sessions.tudominio.com   # añade el bloque listen 443 + redir 80→443
```

---

## 8. Apuntar el DNS

En Cloudflare (o donde tengas el dominio):

- Tipo `A` · Nombre `sessions` · Contenido `IP-ESTÁTICA-LIGHTSAIL` · Proxy **DNS only** (nube gris) hasta que Certbot termine; luego puedes activar Proxy si quieres.

`dig sessions.tudominio.com +short` debe responder con tu IP.

---

## 9. Primer despliegue (manual)

Desde tu máquina local, en el repo:

```bash
# Compila todo lo derivado del manifest TS
npm run build:migrations
npm run build:hooks
npm run build:types
npm run build           # SvelteKit estático -> build/

# Sube
rsync -az --delete build/         ubuntu@TU-IP:/home/ubuntu/session-manager/frontend/
rsync -az --delete pb_hooks/      ubuntu@TU-IP:/home/ubuntu/session-manager/pb_hooks/
rsync -az --delete pb_migrations/ ubuntu@TU-IP:/home/ubuntu/session-manager/pb_migrations/

# Reinicia PocketBase para que recargue hooks
ssh ubuntu@TU-IP 'pm2 restart session-manager-pb'
```

O directamente: `VPS_HOST=TU-IP bash scripts/deploy.sh`.

---

## 10. CI/CD desde GitHub (opcional)

`scripts/deploy.sh` ya está alineado con tu setup (`ubuntu`, `/home/ubuntu/session-manager`, `pm2 restart`). Para activar el workflow:

En **Settings → Secrets and variables → Actions**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `SSH_KEY` | clave privada (la `.pem` de Lightsail o una ED25519 dedicada) |
| Variable | `DEPLOY_HOST` | IP estática de Lightsail |
| Variable | `DEPLOY_USER` | `ubuntu` |
| Variable | `DEPLOY_APP_DIR` | `/home/ubuntu/session-manager` |

`deploy.yml` se dispara cuando CI termina verde sobre `main`. Mientras `DEPLOY_HOST` no exista como variable, el job se salta — sin red CI ✗.

---

## 11. Smoke test post-despliegue

```bash
# 1. PocketBase responde
curl -s https://sessions.tudominio.com/api/health
# {"code":200,"message":"API is healthy.","data":{...}}

# 2. Frontend sirve
curl -sI https://sessions.tudominio.com/ | head -1
# HTTP/2 200

# 3. PWA artifacts presentes
curl -sI https://sessions.tudominio.com/manifest.webmanifest | head -1
curl -sI https://sessions.tudominio.com/sw.js | head -1

# 4. PM2 reporta el proceso
ssh ubuntu@TU-IP 'pm2 list'   # session-manager-pb online

# 5. Logs en vivo (útil al crear el primer juego para ver si Gemini responde)
ssh ubuntu@TU-IP 'pm2 logs session-manager-pb --lines 100'
```

Si al crear un juego ves `[game_created] GEMINI_API_KEY not set, skipping…`, PM2 perdió la env var (suele pasar tras un `pm2 resurrect` sin el var presente). Re-arranca el proceso con la variable:

```bash
ssh ubuntu@TU-IP
pm2 delete session-manager-pb
GEMINI_API_KEY="..." pm2 start ./pocketbase --name session-manager-pb -- serve --http=127.0.0.1:8090 --dir=/home/ubuntu/session-manager/pb_data --hooksDir=/home/ubuntu/session-manager/pb_hooks --migrationsDir=/home/ubuntu/session-manager/pb_migrations
pm2 save
```

Para que la variable sobreviva a reboots, la opción más limpia es ponerla en `/home/ubuntu/.pm2.env` y pasarla al `pm2 start` con `--update-env`, o usar **PM2 ecosystem file**:

`/home/ubuntu/session-manager/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [{
    name: "session-manager-pb",
    script: "./pocketbase",
    args: "serve --http=127.0.0.1:8090 --dir=./pb_data --hooksDir=./pb_hooks --migrationsDir=./pb_migrations",
    cwd: "/home/ubuntu/session-manager",
    env: {
      GEMINI_API_KEY: "tu_key_real",
    },
  }],
};
```

Luego: `pm2 start ecosystem.config.cjs && pm2 save`. **Este archivo no debe commitearse al repo.**

---

## 12. Backups

PocketBase = un solo archivo SQLite en `pb_data/data.db`. Cron diario a las 3 AM:

```bash
# /etc/cron.d/sessionmgr-backup  (root)
0 3 * * * ubuntu /home/ubuntu/session-manager/pocketbase \
  --dir=/home/ubuntu/session-manager/pb_data \
  backup auto-$(date +\%F).zip >> /var/log/sessionmgr-backup.log 2>&1
```

PocketBase deja los backups en `pb_data/backups/`. Para mandarlos a S3/B2, añade un `rclone copy` después.

**Lightsail snapshots** (consola → Snapshots) son el plan B: snapshots manuales antes de cualquier cambio destructivo. ~$0.05/GB/mes.

---

## 13. Coste mensual estimado

| Partida | Coste |
|---|---|
| Lightsail 1 GB | $5 |
| Lightsail static IP (adjunta a instancia) | $0 |
| Snapshots (2 GB conservados) | ~$0.10 |
| Dominio (prorrateado) | ~$1 |
| Gemini API (cientos de juegos/mes) | <$0.50 (free tier suele bastar) |
| **Total** | **~$6.50/mes** |
