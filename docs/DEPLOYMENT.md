# Despliegue y operación

## Método de hosting preferido

**Un único VPS Linux de 1 GB RAM** con stack nativo (sin Docker), gestionado por `systemd` y expuesto por `Caddy`. Despliegue desde GitHub Actions por SSH.

### Proveedor recomendado

| Proveedor | Plan | Precio | Notas |
|---|---|---|---|
| **Hetzner** | CX22 (2 vCPU, 4 GB) | ~€4/mes | **Mejor relación calidad/precio.** Aunque pide más de 1 GB, es lo mínimo actual; si hay que ceñirse a 1 GB exacto, CX11 ya no existe y la alternativa es Contabo/Netcup. |
| **Contabo** | VPS S | ~€4/mes | 4 GB RAM, pero sobresuscrito — CPU inconsistente. Suficiente aquí. |
| **DigitalOcean** | Basic 1 GB | $6/mes | Más caro, mejor red, buena UX si vienes nuevo. |
| **Oracle Cloud Free Tier** | ARM Ampere 1 GB | €0 | Gratis indefinido, ideal para probar. Pide tarjeta pero no cobra. |

**Elección:** Hetzner si el presupuesto lo permite (CPU dedicada, red excelente, datacenter EU). Oracle Free Tier para empezar sin gastar.

### Por qué un solo VPS y no alternativas

| Opción | Descartada porque |
|---|---|
| **Vercel/Netlify + DB externa** | Vercel es gratis para frontend, pero la DB externa (Supabase/Neon) añade latencia y vendor lock-in. El realtime de Supabase en plan free es limitado. Pierdes el control que sí tenemos en un VPS. |
| **Fly.io** | Machines de 256 MB son tentadoras, pero Fly cobra por IOPS y el volumen persistente es complejo. Para SQLite necesitas volumes sticky, y el pricing se dispara con varios. |
| **Render/Railway** | Simples pero caros a medio plazo (~$20+/mes con DB). |
| **Kubernetes** | Absurdo para este tráfico. Overhead de control plane > la app entera. |
| **Serverless (Lambda + DynamoDB)** | PocketBase no encaja; reescribir todo a Lambdas dobla el tiempo a MVP. |

**Un VPS gana** en: coste fijo predecible, control total, SQLite local (latencia <1 ms), simplicidad operativa.

## Preparación del VPS (una vez)

```bash
# Como root en un Ubuntu 24.04 LTS fresco:
apt update && apt upgrade -y
apt install -y ufw fail2ban caddy rclone
ufw default deny incoming
ufw allow 22,80,443/tcp
ufw enable

# Usuario dedicado sin privilegios
useradd -m -s /bin/bash sessionmgr
mkdir -p /home/sessionmgr/{app,pb_data,backups}
chown -R sessionmgr:sessionmgr /home/sessionmgr

# PocketBase
curl -L https://github.com/pocketbase/pocketbase/releases/download/v0.22.0/pocketbase_0.22.0_linux_amd64.zip \
  -o /tmp/pb.zip
unzip /tmp/pb.zip -d /home/sessionmgr/
chown sessionmgr:sessionmgr /home/sessionmgr/pocketbase

# Swap 1 GB (seguro adicional para el VPS de 1 GB)
fallocate -l 1G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### systemd unit (`/etc/systemd/system/pocketbase.service`)

```ini
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=sessionmgr
Group=sessionmgr
WorkingDirectory=/home/sessionmgr
ExecStart=/home/sessionmgr/pocketbase serve --http=127.0.0.1:8090 --dir=/home/sessionmgr/pb_data --hooksDir=/home/sessionmgr/app/pb_hooks
Restart=on-failure
RestartSec=3
MemoryMax=256M
Environment=ANTHROPIC_API_KEY=changeme

[Install]
WantedBy=multi-user.target
```

### Caddyfile (`/etc/caddy/Caddyfile`)

```caddy
app.tudominio.com {
    encode zstd gzip

    # Frontend estático
    root * /home/sessionmgr/app/frontend
    try_files {path} /index.html
    file_server

    # Backend PocketBase
    handle_path /api/* {
        reverse_proxy 127.0.0.1:8090
    }
    handle_path /_/* {
        reverse_proxy 127.0.0.1:8090
    }

    log {
        output file /var/log/caddy/access.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
```

Caddy saca HTTPS de Let's Encrypt automáticamente al primer arranque.

## Estructura del repo

```
session-manager/
├── README.md
├── docs/
│   ├── BUSINESS_RULES.md
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
├── frontend/                     # SvelteKit
│   ├── src/
│   ├── static/
│   ├── svelte.config.js          # adapter-static
│   └── package.json
├── pb_hooks/                     # JS hooks de PocketBase
│   ├── achievements.pb.js        # genera logros con Claude
│   └── xp.pb.js                  # calcula XP tras partida
├── pb_migrations/                # migraciones de schema
├── .github/
│   └── workflows/
│       ├── ci.yml                # lint + build + test
│       └── deploy.yml            # deploy a VPS en push a main
├── scripts/
│   ├── deploy.sh
│   └── backup.sh
└── .env.example
```

## CI/CD con GitHub Actions

### `.github/workflows/deploy.yml` (esquema)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build frontend
        working-directory: frontend
        run: |
          npm ci
          npm run build

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.SSH_KEY }}

      - name: Deploy
        run: |
          rsync -az --delete frontend/build/ \
            sessionmgr@${{ secrets.VPS_HOST }}:/home/sessionmgr/app/frontend/
          rsync -az --delete pb_hooks/ \
            sessionmgr@${{ secrets.VPS_HOST }}:/home/sessionmgr/app/pb_hooks/
          rsync -az --delete pb_migrations/ \
            sessionmgr@${{ secrets.VPS_HOST }}:/home/sessionmgr/app/pb_migrations/
          ssh sessionmgr@${{ secrets.VPS_HOST }} 'sudo systemctl restart pocketbase'
```

**Secrets necesarios en GitHub:**
- `SSH_KEY` — clave privada ED25519 dedicada a despliegues.
- `VPS_HOST` — IP o dominio.
- `ANTHROPIC_API_KEY` — se inyecta al crear el `.env` del servidor (no al repo).

El usuario `sessionmgr` necesita una línea en `sudoers.d/deploy`:

```
sessionmgr ALL=(root) NOPASSWD: /bin/systemctl restart pocketbase
```

Así el restart del servicio es la única acción privilegiada del pipeline.

## Backups

Cron diario 03:00 UTC (`/etc/cron.d/sessionmgr-backup`):

```bash
0 3 * * * sessionmgr /home/sessionmgr/scripts/backup.sh
```

`backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
DEST=/home/sessionmgr/backups
sqlite3 /home/sessionmgr/pb_data/data.db ".backup $DEST/data-$TS.db"
tar czf $DEST/pb_data-$TS.tar.gz -C /home/sessionmgr pb_data
rclone copy $DEST/pb_data-$TS.tar.gz b2:sessionmgr-backups/ --quiet
find $DEST -type f -mtime +7 -delete
```

Coste en Backblaze B2: <$0.50/mes.

## Rollback

Como los artefactos son binarios + estáticos, rollback = volver al commit anterior y re-lanzar el workflow. PocketBase guarda migraciones reversibles; `pb_migrations/` incluye `down()` para las que tocan schema.

## Dominio y DNS

- Comprar dominio en Porkbun/Cloudflare Registrar (~$10/año).
- Apuntar un A record al VPS.
- Caddy se encarga del resto (TLS auto).

## Coste mensual estimado

| Partida | Coste |
|---|---|
| VPS Hetzner CX22 | €4 |
| Dominio (prorrateado) | €1 |
| Backups B2 | €0.50 |
| Claude API (generación de logros) | <€1 (cientos de juegos/mes) |
| **Total** | **~€6.50/mes** |

## Timeline realista al MVP

| Semana | Entregable |
|---|---|
| 1 | VPS listo, PocketBase corriendo, schema base, auth con passcode, CI/CD básico. |
| 2 | SvelteKit con pantallas: join-por-QR, perfil, catálogo de juegos, alta de juego. |
| 3 | Sesión en vivo: contador realtime, votación, registro de partida por co-host, XP. |
| 4 | Logros IA, sonidos/animaciones, PWA instalable, pulido. |

MVP **jugable en 2 semanas** quitándose logros-IA y PWA offline para una versión 0.1 y dejando eso para v0.2.

## Escalado futuro (si hace falta)

- Migrar SQLite → Postgres: PocketBase lo soporta desde 0.22; reescribir nada.
- Separar frontend a CDN (Cloudflare Pages gratis): descarga Caddy del VPS.
- Subir VPS a 2-4 GB RAM si superan los 50 usuarios simultáneos.

Ninguno de estos pasos requiere reescribir código.
