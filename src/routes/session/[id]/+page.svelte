<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { isAuthenticated, currentUser } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { RANDOM_VOTE, type RandomVote } from "$core/voting.js";
  import type { SessionsRecord, MatchesRecord, GamesRecord } from "$core/records.js";
  import SessionLobby from "$lib/components/SessionLobby.svelte";
  import VoteSheet from "$lib/components/VoteSheet.svelte";

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

  $: id = $page.params.id ?? "";
  $: me = currentUser();
  $: isHost = !!session && !!me && session.host === me.id;

  onMount(() => {
    if (!isAuthenticated()) {
      void goto(`/auth?next=${encodeURIComponent(`/session/${id}`)}`);
      return;
    }
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const found = await collection("sessions").getOne(id);
      const list = await collection("session_participants").getList(1, 200, {
        filter: `session = "${found.id}"`,
        skipTotal: false,
      });
      session = found;
      participantCount = list.totalItems;
      joined = list.items.some((p) => p.player === me?.id);

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
      joined = true;
      participantCount += 1;
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

      // The server-side hook resolves the match after everyone's voted,
      // but After*Success hooks run after this request's response is
      // already sent — refetch once immediately, then once more shortly
      // after in case the hook hadn't finished yet. No realtime in this
      // app (see docs/HANDOFF.md), so this short poll is the pragmatic
      // stand-in rather than leaving the UI stuck on stale state.
      await loadMatch(session!.id);
      if (!matchGame) {
        setTimeout(() => void loadMatch(session!.id), 600);
      }
    } catch (err) {
      error = "No se pudo registrar tu voto.";
      console.error(err);
    } finally {
      voting = false;
    }
  }
</script>

<svelte:head><title>Sesión · Session Manager</title></svelte:head>

<header class="mb-6 flex items-center justify-between gap-2">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <span class="text-xs text-slate-500">ID <code>{id.slice(0, 6)}…</code></span>
</header>

<SessionLobby {session} {participantCount} {loading} {error} {joined} {joining} on:join={handleJoin} />

{#if session && !loading}
  {#if isHost && session.status === "created"}
    <button class="start-btn" type="button" disabled={starting} on:click={handleStart}>
      {starting ? "Iniciando…" : "Iniciar sesión"}
    </button>
  {/if}

  {#if session.status === "active" && match}
    {#if matchGame}
      <section class="picked">
        <h2>Jugando</h2>
        <p class="game-name">{matchGame.name}</p>
      </section>
    {:else}
      <VoteSheet games={eligibleGames} currentVote={myVote} disabled={voting} on:vote={handleVote} />
    {/if}
  {/if}
{/if}

<style>
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
</style>
