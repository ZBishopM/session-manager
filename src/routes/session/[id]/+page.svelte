<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { isAuthenticated, currentUser } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { elapsedSince } from "$lib/elapsed.js";
  import { RANDOM_VOTE, type RandomVote } from "$core/voting.js";
  import type { SessionsRecord, MatchesRecord, GamesRecord } from "$core/records.js";
  import SessionLobby from "$lib/components/SessionLobby.svelte";
  import VoteSheet from "$lib/components/VoteSheet.svelte";
  import MatchResultSheet from "$lib/components/MatchResultSheet.svelte";
  import AchievementToast from "$lib/components/AchievementToast.svelte";
  import type { MatchPlayerInfo } from "$lib/components/MatchResultSheet.types.js";
  import type { ToastAchievement } from "$lib/components/AchievementToast.types.js";

  let session: SessionsRecord | null = null;
  let participantCount = 0;
  let joined = false;
  let joining = false;
  let starting = false;
  let loading = true;
  let error: string | null = null;

  let match: MatchesRecord | null = null;
  let matchGame: GamesRecord | null = null;
  let eligibleGames: GamesRecord[] = [];
  let myVote: string | RandomVote | null = null;
  let voting = false;

  let resultPlayers: MatchPlayerInfo[] = [];
  let recordingResult = false;

  // Reloj de la sesión. La sesión dura hasta que el anfitrión la corta, así
  // que lo que importa es cuánto lleva abierta, no cuánto dura una partida.
  let elapsed = "";
  const tick = setInterval(() => { elapsed = elapsedSince(session?.started_at); }, 1000);
  onDestroy(() => clearInterval(tick));
  $: elapsed = elapsedSince(session?.started_at);

  // Quién juega ESTA partida. Estar en la sesión no es estar en la partida:
  // se entra y se sale entre partidas, y cada una se apunta por separado.
  let myMatchRowId: string | null = null;
  let togglingRoster = false;
  let startingMatch = false;
  let endingSession = false;
  let unlockedToasts: ToastAchievement[] = [];

  $: id = $page.params.id ?? "";
  $: me = currentUser();
  $: isHost = !!session && !!me && session.host === me.id;

  onMount(() => {
    if (!isAuthenticated()) {
      void goto(`/auth?next=${encodeURIComponent(`/session/${id}`)}`);
      return;
    }
    void load().then(subscribeRealtime);
  });

  // Realtime (SSE) en vez de reconsultar a ciegas tras cada escritura.
  //
  // Los hooks After*Success de PocketBase corren DESPUES de que la respuesta
  // de la peticion ya salio, asi que quien vota no ve el resultado en su
  // propia respuesta. Esto se parcheaba con dos reconsultas (0 ms y 600 ms)
  // que en produccion llegaban tarde: votabas y "no pasaba nada". Es tambien
  // lo que enmascaro durante meses el ReferenceError de tryCloseVoting.
  //
  // PocketBase ya emite SSE y nginx ya lleva proxy_buffering off para ello
  // (ADR-3, docs/ARCHITECTURE.md); solo faltaba usarlo.
  //
  // Nos suscribimos a "*" y filtramos en el cliente: un filtro de servidor
  // depende de la listRule de cada coleccion y aqui hablamos de decenas de
  // registros, no de miles.
  let unsubscribers: Array<() => void> = [];

  async function subscribeRealtime(): Promise<void> {
    if (!session) return;
    const sessionId = session.id;
    try {
      unsubscribers = await Promise.all([
        collection("sessions").subscribe(sessionId, (e) => {
          session = e.record;
        }),
        collection("matches").subscribe("*", (e) => {
          if (e.record.session !== sessionId) return;
          void loadMatch(sessionId);
        }),
        collection("session_participants").subscribe("*", (e) => {
          if (e.record.session !== sessionId) return;
          void loadParticipants(sessionId);
        }),
        collection("match_players").subscribe("*", (e) => {
          if (match && e.record.match === match.id) void loadRoster(match.id);
        }),
        collection("player_achievements").subscribe("*", (e) => {
          if (e.action !== "create" || e.record.player !== me?.id) return;
          void showAchievementToast(e.record.achievement);
        }),
      ]);
    } catch (err) {
      // Sin SSE la pagina sigue funcionando: solo deja de refrescarse sola.
      console.error(err);
    }
  }

  onDestroy(() => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  });

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const found = await collection("sessions").getOne(id);
      session = found;
      // Antes que loadMatch: los juegos elegibles se filtran por
      // participantCount.
      await loadParticipants(found.id);

      if (found.status === "active") {
        await loadMatch(found.id);
      }
    } catch (err) {
      session = null;
      error = "No encontramos esta sesión.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  /** Cuantos hay y si estas tu, siempre releido del servidor. Llevar la
   *  cuenta a mano se desincronizaba: el anfitrion se veia fuera de su propia
   *  sesion mientras el contador marcaba 1. */
  async function loadParticipants(sessionId: string): Promise<void> {
    const list = await collection("session_participants").getList(1, 200, {
      filter: `session = "${sessionId}"`,
      skipTotal: false,
    });
    participantCount = list.totalItems;
    joined = list.items.some((p) => p.player === me?.id);
  }

  async function loadMatch(sessionId: string): Promise<void> {
    try {
      const list = await collection("matches").getList(1, 1, {
        filter: `session = "${sessionId}"`,
        sort: "-created",
        skipTotal: false,
      });
      match = list.items[0] ?? null;
      matchGame = null;
      myVote = null;
      if (!match) return;

      if (match.game) {
        matchGame = await collection("games").getOne(match.game);
        await loadRoster(match.id);
        return;
      }

      const allGames = await collection("games").getFullList({ sort: "name" });
      eligibleGames = allGames.filter(
        (g) => g.min_players <= participantCount && g.max_players >= participantCount,
      );

      if (me) {
        const myVoteRec = await collection("votes").getList(1, 1, {
          filter: `match = "${match.id}" && player = "${me.id}"`,
          skipTotal: false,
        });
        myVote = myVoteRec.items[0]?.game || (myVoteRec.items[0] ? RANDOM_VOTE : null);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /** Los apuntados a esta partida. La fila de match_players se crea al
   *  apuntarse, no al registrar el resultado: así "quién juega" existe
   *  durante la partida y no solo al final. `won` se rellena después. */
  async function loadRoster(matchId: string): Promise<void> {
    const rows = await collection("match_players").getFullList({
      filter: `match = "${matchId}"`,
    });
    myMatchRowId = rows.find((r) => r.player === me?.id)?.id ?? null;
    resultPlayers = await Promise.all(
      rows.map(async (r) => {
        try {
          const player = await collection("players").getOne(r.player);
          return { id: r.player, nickname: player.nickname };
        } catch {
          return { id: r.player, nickname: "?" };
        }
      }),
    );
  }

  /** Apuntarse o borrarse de la partida actual. Borrarse es quitar la fila:
   *  no hay "he dicho que no", simplemente no estás en esta partida. Vuelve
   *  a preguntarse en la siguiente. */
  async function toggleRoster(): Promise<void> {
    if (!match || !me || togglingRoster) return;
    togglingRoster = true;
    error = null;
    try {
      if (myMatchRowId) {
        await collection("match_players").delete(myMatchRowId);
      } else {
        await collection("match_players").create({ match: match.id, player: me.id });
      }
      await loadRoster(match.id);
    } catch (err) {
      error = "No se pudo cambiar tu participación.";
      console.error(err);
    } finally {
      togglingRoster = false;
    }
  }

  /** El anfitrión arranca cuando quiere; quien no se haya apuntado se queda
   *  fuera de esta partida y entra en la siguiente. */
  async function handleStartMatch(): Promise<void> {
    if (!match || startingMatch) return;
    startingMatch = true;
    error = null;
    try {
      const updated = await collection("matches").update(match.id, {
        status: "playing",
        started_at: new Date().toISOString(),
      });
      match = updated;
    } catch (err) {
      error = "No se pudo empezar la partida.";
      console.error(err);
    } finally {
      startingMatch = false;
    }
  }

  /** Otra partida en la misma sesión: la reunión sigue. */
  async function handleNewMatch(): Promise<void> {
    if (!session || starting) return;
    starting = true;
    error = null;
    try {
      match = await collection("matches").create({ session: session.id, status: "voting" });
      matchGame = null;
      myVote = null;
      resultPlayers = [];
      myMatchRowId = null;
      await loadMatch(session.id);
    } catch (err) {
      error = "No se pudo crear la partida.";
      console.error(err);
    } finally {
      starting = false;
    }
  }

  /** La sesión solo termina cuando el anfitrión lo dice. */
  async function handleEndSession(): Promise<void> {
    if (!session || endingSession) return;
    endingSession = true;
    error = null;
    try {
      session = await collection("sessions").update(session.id, {
        status: "ended",
        ended_at: new Date().toISOString(),
      });
    } catch (err) {
      error = "No se pudo terminar la sesión.";
      console.error(err);
    } finally {
      endingSession = false;
    }
  }

  async function handleJoin(): Promise<void> {
    if (!session || joined || joining || !me) return;
    joining = true;
    error = null;
    try {
      await collection("session_participants").create({
        session: session.id,
        player: me.id,
        status: "present",
        joined_at: new Date().toISOString(),
      });
      await loadParticipants(session.id);
    } catch (err) {
      error = "No se pudo unir a la sesión. Probá de nuevo.";
      console.error(err);
    } finally {
      joining = false;
    }
  }

  async function handleStart(): Promise<void> {
    if (!session || starting) return;
    starting = true;
    error = null;
    try {
      const created = await collection("matches").create({
        session: session.id,
        status: "voting",
      });
      const updated = await collection("sessions").update(session.id, { status: "active" });
      session = updated;
      match = created;
      await loadMatch(session.id);
    } catch (err) {
      error = "No se pudo iniciar la sesión.";
      console.error(err);
    } finally {
      starting = false;
    }
  }

  async function handleVote(e: CustomEvent<{ gameId: string | RandomVote }>): Promise<void> {
    if (!match || !me || voting) return;
    voting = true;
    error = null;
    try {
      const gameId = e.detail.gameId === RANDOM_VOTE ? "" : e.detail.gameId;
      const existing = await collection("votes").getList(1, 1, {
        filter: `match = "${match.id}" && player = "${me.id}"`,
        skipTotal: false,
      });
      if (existing.items[0]) {
        await collection("votes").update(existing.items[0].id, { game: gameId });
      } else {
        await collection("votes").create({ match: match.id, player: me.id, game: gameId });
      }
      myVote = e.detail.gameId;

      // Una lectura para reflejar tu propio voto. Cuando el hook cierre la
      // votacion llegara por SSE, sin sondeo.
      await loadMatch(session!.id);
    } catch (err) {
      error = "No se pudo registrar tu voto.";
      console.error(err);
    } finally {
      voting = false;
    }
  }

  async function handleRecordResult(
    e: CustomEvent<{ winnerIds: string[]; durationSeconds: number; placements?: Record<string, number> }>,
  ): Promise<void> {
    if (!match || !matchGame || !session || recordingResult) return;
    recordingResult = true;
    error = null;
    const { winnerIds, durationSeconds, placements } = e.detail;
    try {
      // Las filas ya existen desde que cada uno se apuntó: aquí solo se
      // rellena el resultado.
      const rows = await collection("match_players").getFullList({
        filter: `match = "${match.id}"`,
      });
      for (const row of rows) {
        const data: Record<string, unknown> = { won: winnerIds.includes(row.player) };
        if (placements?.[row.player]) data.placement = placements[row.player];
        await collection("match_players").update(row.id, data);
      }
      await collection("matches").update(match.id, {
        duration_seconds: durationSeconds,
        ended_at: new Date().toISOString(),
        status: "done",
      });
      // La sesión NO se cierra aquí: sigue abierta para más partidas hasta
      // que el anfitrión la termine.
      match = { ...match, status: "done", duration_seconds: durationSeconds };
      // Los logros que desbloquee match_finished.pb.js llegan por SSE.
    } catch (err) {
      error = "No se pudo registrar el resultado.";
      console.error(err);
    } finally {
      recordingResult = false;
    }
  }

  /** Un logro desbloqueado para mi mientras estoy en la pagina. El evento
   *  solo trae el id, asi que se lee el logro para el toast. */
  async function showAchievementToast(achievementId: string): Promise<void> {
    if (unlockedToasts.some((t) => t.id === achievementId)) return;
    try {
      const a = await collection("achievements").getOne(achievementId);
      unlockedToasts = [
        ...unlockedToasts,
        {
          id: a.id,
          title: a.title,
          description: a.description,
          rarity: a.rarity as ToastAchievement["rarity"],
        },
      ];
    } catch (err) {
      console.error(err);
    }
  }

  function dismissToast(id: string): void {
    unlockedToasts = unlockedToasts.filter((t) => t.id !== id);
  }
</script>

<svelte:head><title>Sesión · Session Manager</title></svelte:head>

<header class="mb-6 flex items-center justify-between gap-2">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  {#if elapsed && session?.status !== "ended"}
    <span class="text-xs font-semibold text-slate-300" data-testid="session-elapsed">⏱ {elapsed}</span>
  {/if}
  <span class="text-xs text-slate-500">ID <code>{id.slice(0, 6)}…</code></span>
</header>

<SessionLobby {session} {participantCount} {loading} {error} {joined} {joining} on:join={handleJoin} />

{#if session && !loading}
  {#if isHost && session.status === "created"}
    <button class="start-btn" type="button" disabled={starting} data-testid="start-session" on:click={handleStart}>
      {starting ? "Iniciando…" : "Iniciar sesión"}
    </button>
  {/if}

  {#if session.status === "active" && match}
    {#if matchGame}
      <section class="picked">
        <h2>{match.status === "done" ? "Terminada" : "Jugando"}</h2>
        <p class="game-name">{matchGame.name}</p>
      </section>

      {#if match.status === "voting"}
        <!-- Quién juega esta partida. Estar en la sesión no te mete
             automáticamente: cada partida se elige por separado. -->
        <section class="roster">
          <h3>Quién juega ({resultPlayers.length})</h3>
          <ul>
            {#each resultPlayers as p (p.id)}
              <li>{p.nickname}</li>
            {:else}
              <li class="muted">Nadie todavía</li>
            {/each}
          </ul>
          <button
            type="button"
            class="roster-btn"
            disabled={togglingRoster}
            data-testid="toggle-roster"
            on:click={toggleRoster}
          >
            {myMatchRowId ? "Me la salto" : "Me apunto"}
          </button>
          {#if isHost}
            <button
              type="button"
              class="start-btn"
              disabled={startingMatch || resultPlayers.length === 0}
              data-testid="start-match"
              on:click={handleStartMatch}
            >
              {startingMatch ? "Empezando…" : "Empezar partida"}
            </button>
          {/if}
        </section>
      {:else if match.status === "playing" && isHost}
        <div class="result-sheet">
          <MatchResultSheet
            players={resultPlayers}
            disabled={recordingResult}
            on:confirm={handleRecordResult}
          />
        </div>
      {:else if match.status === "done" && isHost}
        <button type="button" class="start-btn" disabled={starting} data-testid="new-match" on:click={handleNewMatch}>
          {starting ? "Creando…" : "Otra partida"}
        </button>
      {/if}
    {:else}
      <VoteSheet games={eligibleGames} currentVote={myVote} disabled={voting} on:vote={handleVote} />
    {/if}
  {/if}

  {#if isHost && session.status !== "ended"}
    <button
      type="button"
      class="end-btn"
      disabled={endingSession}
      data-testid="end-session"
      on:click={handleEndSession}
    >
      {endingSession ? "Terminando…" : "Terminar sesión"}
    </button>
  {/if}
{/if}

<div class="toast-stack">
  {#each unlockedToasts as t (t.id)}
    <AchievementToast achievement={t} playerNickname={me?.nickname ?? null} on:dismiss={() => dismissToast(t.id)} />
  {/each}
</div>

<style>
  .roster {
    margin-top: 1rem;
    border-radius: 1rem;
    background: rgba(30, 41, 59, 0.7);
    padding: 1rem;
  }
  .roster h3 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #94a3b8;
  }
  .roster ul { margin: 0 0 0.75rem; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .roster li {
    border-radius: 999px;
    background: #0f172a;
    padding: 0.25rem 0.7rem;
    font-size: 0.8rem;
    color: #e2e8f0;
  }
  .roster li.muted { background: none; color: #64748b; }
  .roster-btn {
    width: 100%;
    padding: 0.7rem 1rem;
    border-radius: 999px;
    border: 1px solid #475569;
    background: transparent;
    color: #e2e8f0;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .end-btn {
    margin-top: 1.5rem;
    width: 100%;
    padding: 0.7rem 1rem;
    border-radius: 999px;
    border: 1px solid #7f1d1d;
    background: transparent;
    color: #fca5a5;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .start-btn {
    margin-top: 1rem;
    width: 100%;
    padding: 0.8rem 1rem;
    border-radius: 999px;
    border: 0;
    background: linear-gradient(90deg, #6366f1, #22d3ee);
    color: white;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
  }
  .start-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .picked {
    margin-top: 1.25rem;
    background: #1e293b;
    border-radius: 14px;
    padding: 1rem 1.1rem;
  }
  .picked h2 {
    margin: 0 0 0.25rem;
    font-size: 0.8rem;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .game-name {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .result-sheet {
    margin-top: 1rem;
  }
  .toast-stack {
    position: fixed;
    inset-inline: 0;
    bottom: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem;
    pointer-events: none;
    z-index: 50;
  }
</style>
