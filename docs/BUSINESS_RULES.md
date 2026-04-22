# Reglas de negocio

## 1. Roles

| Rol | Permisos clave |
|---|---|
| **Jugador** | Crear perfil, unirse por QR, votar, marcar favoritos/categorías, participar o pasar en una partida, retirarse de la sesión. |
| **Host** | Todo lo de Jugador + crear sesión, iniciar/terminar sesión, expulsar jugadores, dar de alta juegos en el catálogo, marcar qué juegos posee, asignar co-host. **Solo uno por sesión.** |
| **Co-Host** | Todo lo de Jugador + registrar resultado final de cada partida (quién ganó, quién perdió, duración). **Asignado por el host** al inicio de la sesión (botón de asignación manual o aleatoria). |

Host y Co-Host **acumulan más XP** como compensación por llevar la carga operativa.

## 2. Autenticación

- Nickname + **passcode de 4 dígitos**.
- Alternativa opcional: **patrón táctil** (grid 3×3 tipo Android) que se canonicaliza a un número de 4 dígitos antes de enviarlo al backend.
- Passcode se almacena con **Argon2id** (PocketBase lo soporta nativo).
- Si dos nicknames colisionan, se sufija con un discriminador (`Ana#42`).

> **Decisión consciente:** 4 dígitos es *débil* criptográficamente, pero el modelo de amenaza es un grupo de amigos en una casa, no internet abierto. Se mitiga con *rate limit* por IP+nickname (5 intentos / 15 min) y bloqueo temporal. No hay datos sensibles: perder la cuenta = perder stats, no dinero.

## 3. Ciclo de vida de una sesión

```
[Host crea sesión] → QR generado
        ↓
[Jugadores escanean QR] → se unen como "presentes"
        ↓
[Host asigna Co-Host] (manual o botón 🎲 aleatorio)
        ↓
[Host inicia sesión] → se congela el roster inicial
        ↓
┌─── Loop de partidas ───┐
│  1. Votación de juego  │
│  2. Selección jugadores│
│  3. Partida            │
│  4. Co-host registra   │
└────────────────────────┘
        ↓
[Host termina sesión] → stats consolidadas
```

**Estados de un jugador dentro de una sesión:**
- `presente` — en la sala, visible en el contador.
- `jugando` — participando en la partida actual.
- `espectador` — en la sesión pero pasa esta partida.
- `retirado` — se fue (voluntario o expulsado por host).

## 4. Votación de juego

- Se muestra la lista de juegos **que el host posee** y cumplen el rango de jugadores presentes.
- Cada jugador tiene **1 voto**: un juego concreto **o** `🎲 Aleatorio`.
- Si **mayoría simple vota Aleatorio** → se elige uno al azar entre los elegibles.
- Empates → desempata el host.
- **Re-roll:** un jugador con XP suficiente puede gastar un re-roll (consumible) cuando el resultado fue aleatorio, forzando un nuevo sorteo. Coste sugerido: 1 re-roll por cada 3 partidas hosteadas/co-hosteadas.

## 5. Selección de jugadores por partida

Tras elegir el juego, cada presente decide:
- **Participar** (`jugando`) — contará para stats.
- **Pasar** (`espectador`) — sigue en la sesión, no afecta su *win rate*.

Si el número de `jugando` queda fuera del rango `[min, max]` del juego, el host puede:
- Esperar a que alguien se una.
- Cambiar juego (nueva votación).
- Forzar el inicio (si ≥ min).

## 6. Registro de resultado (co-host)

Al terminar la partida, el co-host abre la pantalla de resultado:
- **Duración** — cronómetro iniciado al confirmar "empezar partida" (editable manualmente).
- **Ganadores** — selección múltiple (soporta juegos por equipos donde varios ganan). Todos los demás `jugando` quedan como perdedores.
- **Opcional:** cada jugador marca 👍/👎 al juego tras la partida (alimenta el *liked* en stats).

El resultado **no** lo registra el propio ganador → evita disputas y refuerza el rol social del co-host.

## 7. Catálogo de juegos (gestionado por Host)

Campos al dar de alta:
- `name` (único)
- `min_players`, `max_players`
- `categories` (multi-select: *party*, *estrategia*, *cooperativo*, *deducción*, etc.)
- `image` (upload)
- `owned_by` (set de user IDs que lo poseen físicamente)
- `description` (opcional, usada para el prompt de logros)

Al crear un juego, **se dispara la generación de logros por IA** (ver §9).

## 8. Preferencias de jugador

- **Categorías favoritas** — editable en perfil. Se usa para sugerir juegos y rankings temáticos.
- **Juegos favoritos** — estrella en la ficha del juego.
- **Historial** — sesiones, partidas, duración acumulada, victorias/derrotas, win rate por juego y global.

## 9. Logros generados por IA

- **Cuándo se generan:** al crear un juego en el catálogo. Se llama a la Claude API (`claude-haiku-4-5`) con `name`, `categories`, `description` y se piden **6 logros** cubriendo:
  - Victorias acumuladas (1, 5, 25).
  - Derrotas acumuladas (con pun de consuelo).
  - Rachas (3 victorias seguidas, 3 derrotas seguidas).
  - Hitos específicos (partida muy larga, muy corta).
- **Cuándo se muestran:** al cerrar el resultado de la partida, la app comprueba qué logros se desbloquean y los presenta **a toda la mesa** con sonido y animación — el dispositivo del co-host es el que "proyecta" si hay pantalla compartida, si no cada uno lo ve en el suyo.
- **Cacheado:** generados una vez, guardados en tabla `achievements` por juego. Nunca se regeneran (determinismo social: "a mí me salió el mismo logro").
- **Formato esperado del modelo:** JSON estructurado con `title`, `description` (con pun), `trigger` (expresión evaluable: `wins_on_game >= 5`), `rarity` (common/rare/epic).

Prompt caching sobre las instrucciones del sistema — los campos del juego son la parte variable.

## 10. XP y niveles

| Acción | XP |
|---|---|
| Participar en partida | 10 |
| Ganar partida | +15 (acumula con la anterior) |
| Dar 👍 o 👎 a un juego | 2 |
| Hostear una sesión | 50 por sesión |
| Co-hostear una sesión | 30 por sesión |
| Agregar juego al catálogo | 25 |
| Desbloquear logro | variable por rareza (10/25/50) |

Curva de niveles: `xp_needed(lvl) = 100 * lvl^1.5`. Hasta nivel 5 es rápido (enganche), luego se ralentiza.

**Re-rolls** (consumibles) se conceden cada cierto número de partidas hosteadas/co-hosteadas, no por XP, para que sean premio directo al esfuerzo operativo.

## 11. Moderación en sesión

- El host puede **expulsar** a un jugador de la sesión (caso de uso: alguien se fue a casa sin marcarse retirado).
- Un jugador expulsado **conserva** sus stats de partidas ya registradas en esa sesión.
- El jugador puede **retirarse** voluntariamente en cualquier momento; sus partidas previas cuentan.

## 12. Privacidad y datos

- No se pide email ni teléfono.
- No hay recuperación de passcode por canal externo → si lo olvidas, el host puede crear un perfil nuevo "adoptando" tus stats (*merge* manual). Es aceptable para el caso de uso.
- Exportable: cada jugador puede descargar su historial en JSON desde su perfil.
