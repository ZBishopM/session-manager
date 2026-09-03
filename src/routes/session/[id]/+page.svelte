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
  let unlockedToasts: ToastAchievement[] = [];

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
        if (match.status !== "done") {
          const participants = await collection("session_participants").getFullList({
            filter: `session = "${sessionId}" && (status = "present" || status = "playing")`,
          });
          resultPlayers = await Promise.all(
            participants.map(async (p) => {
              try {
                const player = await collection("players").getOne(p.player);
                return { id: p.player, nickname: player.nickname };
              } catch {
                return { id: p.player, nickname: "?" };
              }
            }),
          );
        }
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

  async function handleRecordResult(
    e: CustomEvent<{ winnerIds: string[]; durationSeconds: number; placements?: Record<string, number> }>,
  ): Promise<void> {
    if (!match || !matchGame || !session || recordingResult) return;
    recordingResult = true;
    error = null;
    const beforeIso = new Date().toISOString();
    const { winnerIds, durationSeconds, placements } = e.detail;
    try {
      for (const p of resultPlayers) {
        const data: Record<string, unknown> = { won: winnerIds.includes(p.id) };
        if (placements?.[p.id]) data.placement = placements[p.id];
        await collection("match_players").create({ match: match.id, player: p.id, ...data });
      }
      await collection("matches").update(match.id, {
        duration_seconds: durationSeconds,
        ended_at: new Date().toISOString(),
        status: "done",
      });
      await collection("sessions").update(session.id, { status: "ended" });
      match = { ...match, status: "done", duration_seconds: durationSeconds };
      session = { ...session, status: "ended" };

      if (me) await pollForNewAchievements(matchGame.id, beforeIso);
    } catch (err) {
      error = "No se pudo registrar el resultado.";
      console.error(err);
    } finally {
      recordingResult = false;
    }
  }

  interface AchievementExpand {
    id: string;
    title: string;
    description: string;
    rarity: string;
  }

  async function pollForNewAchievements(gameId: string, sinceIso: string): Promise<void> {
    // Same "poll after write" workaround as handleVote above —
    // match_finished.pb.js's After*Success write lands after this
    // request's own response, so re-check a couple times shortly after.
    for (const delay of [0, 700, 1600]) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        const unlocks = await collection("player_achievements").getFullList({
          filter: `player = "${me!.id}" && achievement.game = "${gameId}" && unlocked_at >= "${sinceIso}"`,
          expand: "achievement",
        });
        if (unlocks.length > 0) {
          unlockedToasts = unlocks
            .map((u) => (u as unknown as { expand?: { achievement?: AchievementExpand } }).expand?.achievement)
            .filter((a): a is AchievementExpand => !!a)
            .map((a) => ({
              id: a.id,
              title: a.title,
              description: a.description,
              rarity: a.rarity as ToastAchievement["rarity"],
            }));
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  function dismissToast(id: string): void {
    unlockedToasts = unlockedToasts.filter((t) => t.id !== id);
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
      {#if isHost && match.status !== "done"}
        <div class="result-sheet">
          <MatchResultSheet
            players={resultPlayers}
            disabled={recordingResult}
            on:confirm={handleRecordResult}
          />
        </div>
      {/if}
    {:else}
      <VoteSheet games={eligibleGames} currentVote={myVote} disabled={voting} on:vote={handleVote} />
    {/if}
  {/if}
{/if}

<div class="toast-stack">
  {#each unlockedToasts as t (t.id)}
    <AchievementToast achievement={t} playerNickname={me?.nickname ?? null} on:dismiss={() => dismissToast(t.id)} />
  {/each}
</div>

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
