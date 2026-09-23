# Despliegue y operación

> **El despliegue es automático.** `.github/workflows/deploy.yml` corre solo
> tras cada push a `main` que pase CI; los secretos y variables ya están
> configurados. La §9 ("primer despliegue manual") está solo por si hay que
> hacerlo a mano alguna vez.
>
> **Ya no hay Lightsail** (confirmado 2026-09-09). Esto vive en el VPS
> Hetzner compartido descrito en la §1. Lo que sigue verificado contra la
> máquina real a esa fecha: host, usuario, rutas, proceso pm2 y despliegue
> por CI. Lo de nginx y certbot no se re-comprobó línea por línea.
>
> **Backups (2026-09-02):** a diferencia del resto de este doc, esto sí está implementado y verificado — cron diario 03:00 en `bicho`'s crontab, `~/backups/backup.sh`, retiene los últimos 7 de `pb_data`, `stalwart-data` y `stalwart-etc` (los dos últimos vía un contenedor Docker desechable ya que los volúmenes son root-owned en el host). Es respaldo **local** (mismo disco) — protege contra migraciones malas o borrados accidentales, no contra falla del disco/hardware. Backup fuera de la máquina (Hetzner Storage Box, S3, etc.) queda pendiente, requiere elegir destino y credenciales.
>
> **Variables de entorno**: ver `.env.example` en la raíz del repo — lista completa de lo que leen los hooks vía `$os.getenv()`.

**Dos consolas, dos máquinas.** Los bloques marcados `nu` se ejecutan en tu
máquina, cuya consola es [nushell](https://www.nushell.sh/). Los marcados
`bash` se ejecutan dentro del VPS, cuya consola es bash — allí no hay nu. La
mayoría de este documento son pasos de servidor, así que casi todo es `bash`;
lo local está en las §9 y §11.

Stack en producción: **VPS Hetzner compartido** (`agapornis`), sin Docker,
gestionado por **PM2** y expuesto vía **Nginx** con TLS de Let's Encrypt. La
base de datos es SQLite embebida en PocketBase.

---

## 1. Dónde vive esto

| | valor |
|---|---|
| máquina | `agapornis`, 167.233.88.83 (Hetzner) |
| usuario | `bicho` |
| PocketBase | `/var/www/session-manager/pb/` |
| frontend | `/var/www/session-manager/build/` |
| proceso pm2 | `session-manager-pb`, escucha en `127.0.0.1:8090` |
| logs de hooks | `~/.pm2/logs/session-manager-pb-out.log` |
| consola | bash — **no hay nu en el VPS** |

La máquina es **compartida**: conviven el correo (Stalwart), Postgres/n8n de
in_out, piles-game (producción y beta) y Navidrome. ~3,7 GB de RAM y **sin
swap**, así que cualquier compilación pesada se lanza con `nice -n 19 … -j 1`
para no despertar al OOM killer sobre algo que importa.

PocketBase arranca **sin** los flags `--hooksDir` / `--migrationsDir`: los
toma relativos a su cwd, que es `/var/www/session-manager/pb/`. Si el proceso
se relanza desde otro directorio, deja de ver hooks y migraciones.

> Las secciones 3–8 describen cómo se monta todo esto desde cero. Están como
> referencia para rehacerlo o levantar otro entorno, no como algo que haya que
> ejecutar hoy.

---

## 3. Software base en la VPS (una sola vez)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx unzip ufw rsync

# UFW
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
pm2 startup systemd -u bicho --hp /home/bicho
# Copia y ejecuta la línea sudo que PM2 imprime, para que arranque al boot.
```

---

## 4. Estructura del proyecto en el VPS

```bash
mkdir -p /var/www/session-manager/{frontend,pb_data,pb_hooks,pb_migrations}
cd /var/www/session-manager

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
cd /var/www/session-manager

# Inyecta la GEMINI_API_KEY como variable de entorno del proceso
GEMINI_API_KEY="pega_tu_key_aqui" \
  pm2 start ./pocketbase \
    --name session-manager-pb \
    -- serve \
       --http=127.0.0.1:8090 \
       --dir=/var/www/session-manager/pb_data \
       --hooksDir=/var/www/session-manager/pb_hooks \
       --migrationsDir=/var/www/session-manager/pb_migrations

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
    root /var/www/session-manager/frontend;
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

```nu
# Compila todo lo derivado del manifest TS. Si uno falla, los siguientes no
# corren: en nu cada línea depende de que la anterior fuera bien.
pnpm run build:migrations
pnpm run build:hooks
pnpm run build:types
pnpm run build           # SvelteKit estático -> build/

# Sube. Ojo a la forma del destino: los hooks y las migraciones van DENTRO de
# pb/, porque el cwd de PocketBase es /var/www/session-manager/pb y los busca
# relativos a ahí.
rsync -az --delete build/         bicho@167.233.88.83:/var/www/session-manager/build/
rsync -az --delete pb_hooks/      bicho@167.233.88.83:/var/www/session-manager/pb/pb_hooks/
rsync -az --delete pb_migrations/ bicho@167.233.88.83:/var/www/session-manager/pb/pb_migrations/

# Reinicia PocketBase para que recargue hooks
ssh bicho@167.233.88.83 "pm2 restart session-manager-pb"
```

O directamente, también desde tu máquina — `deploy.sh` es un script bash, así
que se le llama con `bash` explícito. Ya trae `bicho` y
`/var/www/session-manager` por defecto, así que basta con el host:

```nu
VPS_HOST=167.233.88.83 bash scripts/deploy.sh
```

---

## 10. CI/CD desde GitHub

**Esto es lo que corre hoy**, y por eso la §9 casi nunca hace falta.
`scripts/deploy.sh` ya apunta al setup real (`bicho`,
`/var/www/session-manager`, `pm2 restart`).

Lo configurado en **Settings → Secrets and variables → Actions**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `SSH_KEY` | clave privada ED25519 dedicada al deploy |
| Variable | `DEPLOY_HOST` | `167.233.88.83` |
| Variable | `DEPLOY_USER` | `bicho` |
| Variable | `DEPLOY_APP_DIR` | `/var/www/session-manager` |

`deploy.yml` se dispara cuando CI termina verde sobre `main`. Mientras
`DEPLOY_HOST` no exista como variable, el job se salta — así un clon del repo
sin VPS no pone CI en rojo.

---

## 11. Smoke test post-despliegue

```nu
let host = "https://sessions.tudominio.com"

# 1. PocketBase responde. http get parsea el JSON, así que sale un registro.
http get $"($host)/api/health"
# message: "API is healthy.", code: 200

# 2 y 3. Frontend y artefactos PWA, con su código de estado
["/" "/manifest.webmanifest" "/sw.js"] | each {|p|
    {ruta: $p, estado: (http get --full $"($host)($p)" | get status)}
}
# Esperado: 200 en las tres

# 4. PM2 reporta el proceso
ssh bicho@167.233.88.83 "pm2 list"   # session-manager-pb online

# 5. Logs en vivo (útil al crear el primer juego para ver si Gemini responde)
ssh bicho@167.233.88.83 "pm2 logs session-manager-pb --lines 100"
```

Si al crear un juego ves `[game_created] GEMINI_API_KEY not set, skipping…`, PM2 perdió la env var (suele pasar tras un `pm2 resurrect` sin el var presente). Re-arranca el proceso con la variable:

El binario y su cwd viven en `/var/www/session-manager/pb`, y PocketBase toma
`pb_data`, `pb_hooks` y `pb_migrations` relativos a ahí — por eso no llevan
flags:

```bash
ssh bicho@167.233.88.83
cd /var/www/session-manager/pb
pm2 delete session-manager-pb
GEMINI_API_KEY="..." pm2 start ./pocketbase --name session-manager-pb --cwd /var/www/session-manager/pb -- serve --http=127.0.0.1:8090
pm2 save
```

Para que la variable sobreviva a reboots, la opción más limpia es ponerla en `/home/bicho/.pm2.env` y pasarla al `pm2 start` con `--update-env`, o usar **PM2 ecosystem file**:

`/var/www/session-manager/pb/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [{
    name: "session-manager-pb",
    script: "./pocketbase",
    args: "serve --http=127.0.0.1:8090",
    // Sin cwd correcto, PocketBase no encuentra hooks ni migraciones.
    cwd: "/var/www/session-manager/pb",
    env: {
      GEMINI_API_KEY: "tu_key_real",
    },
  }],
};
```

Luego: `pm2 start ecosystem.config.cjs && pm2 save`. **Este archivo no debe commitearse al repo.**

---

## 12. Backups

PocketBase = un solo archivo SQLite en `pb_data/data.db`.

**Lo que corre hoy**: cron diario a las 03:00 en el crontab de `bicho`,
`~/backups/backup.sh`. Retiene los últimos 7 de `pb_data`, `stalwart-data` y
`stalwart-etc`.

Es respaldo **local**, en el mismo disco: protege contra una migración mala o
un borrado accidental, no contra fallo de disco. Sacar los backups de la
máquina (Hetzner Storage Box, S3…) sigue pendiente y requiere elegir destino
y credenciales.

**Antes de cualquier cambio destructivo**, copia `pb_data` a mano — es un
directorio pequeño y la copia es la única marcha atrás real:

```bash
cd /var/www/session-manager/pb
cp -a pb_data pb_data.bak-$(date +%Y%m%d-%H%M%S)
```

Ojo al leer un `data.db` copiado: SQLite está en modo WAL, así que hay que
llevarse también `data.db-wal` y `data.db-shm`, o verás datos viejos.

---

## 13. Coste

El VPS es compartido con el correo, piles-game, n8n/postgres y Navidrome, así
que este proyecto no tiene una factura propia: el coste marginal de añadirlo
fue cero. Lo único que podría costar aparte es la API de Gemini, y hoy ni
siquiera está en uso — `GEMINI_API_KEY` no está puesta en producción.

(La tabla de costes que había aquí era de la instancia Lightsail, que ya no
existe.)
