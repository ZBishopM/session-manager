<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { collection } from "$lib/pb.js";
  import { isAuthenticated, currentUser } from "$lib/auth.js";
  import { triggerExprIsValid } from "$core/achievements.js";
  import type { GamesRecord, AchievementsRecord } from "$core/records.js";

  const RARITY_LABEL_ES: Record<string, string> = { common: "común", rare: "raro", epic: "épico" };
  function rarityLabel(rarity: string): string {
    return RARITY_LABEL_ES[rarity] ?? rarity;
  }
  const STAT_HELP = [
    "total_wins",
    "wins_on_game",
    "losses_on_game",
    "current_streak_wins",
    "current_streak_losses",
    "match_duration_seconds",
    "match_duration_minutes",
  ];

  $: id = $page.params.id ?? "";
  $: me = currentUser();

  let game: GamesRecord | null = null;
  let achievements: AchievementsRecord[] = [];
  let loading = true;
  let error: string | null = null;

  let title = "";
  let description = "";
  let triggerExpr = "";
  let proposing = false;
  let proposeError: string | null = null;
  let proposeSuccess = false;

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const [g, achList] = await Promise.all([
        collection("games").getOne(id),
        collection("achievements").getFullList({
          filter: `game = "${id}" && status = "approved"`,
          sort: "rarity",
        }),
      ]);
      game = g;
      achievements = achList;
    } catch (err) {
      error = "No encontramos este juego.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  $: exprValid = triggerExpr.trim() === "" || triggerExprIsValid(triggerExpr);

  async function propose(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!me || proposing || !exprValid || !triggerExpr.trim()) return;
    proposing = true;
    proposeError = null;
    proposeSuccess = false;
    try {
      await collection("achievements").create({
        game: id,
        title,
        description,
        trigger_expr: triggerExpr,
        rarity: "common",
        // status/proposed_by are force-overwritten server-side regardless
        // of what's sent — see pb_hooks/achievement_proposal.pb.js.
        status: "pending",
      });
      title = "";
      description = "";
      triggerExpr = "";
      proposeSuccess = true;
    } catch (err) {
      proposeError = "No se pudo enviar la propuesta.";
      console.error(err);
    } finally {
      proposing = false;
    }
  }
</script>

<svelte:head><title>{game?.name ?? "Juego"} · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/games" class="text-xs text-slate-400">← Catálogo</a>
</header>

{#if loading}
  <p class="text-sm text-slate-400" data-testid="game-loading">Cargando…</p>
{:else if error || !game}
  <p class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="game-error">
    {error ?? "No encontramos este juego."}
  </p>
{:else}
  <section class="flex flex-col gap-2 rounded-2xl bg-slate-800/70 p-5">
    <h1 class="text-xl font-bold text-slate-100">{game.name}</h1>
    <p class="text-xs text-slate-400">{game.min_players}–{game.max_players} jugadores</p>
    {#if game.description}
      <p class="text-sm text-slate-300">{game.description}</p>
    {/if}
  </section>

  <h2 class="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">Logros</h2>
  {#if achievements.length === 0}
    <p class="text-sm text-slate-400" data-testid="achievements-empty">
      Todavía no hay logros aprobados para este juego.
    </p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each achievements as a (a.id)}
        <li class="rounded-xl bg-slate-800/70 px-3 py-2.5" data-testid="achievement-{a.id}">
          <div class="flex items-center justify-between gap-2">
            <strong class="text-sm text-slate-100">{a.title}</strong>
            <span class="text-[10px] uppercase tracking-wide text-slate-400">
              {rarityLabel(a.rarity)}
            </span>
          </div>
          <p class="text-xs text-slate-400">{a.description}</p>
        </li>
      {/each}
    </ul>
  {/if}

  <h2 class="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
    Proponer un logro
  </h2>
  {#if !isAuthenticated()}
    <p class="text-sm text-slate-400">Inicia sesión para proponer un logro.</p>
  {:else}
    <form class="flex flex-col gap-3" on:submit={propose}>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-slate-300">Título</span>
        <input
          bind:value={title}
          required
          maxlength="80"
          data-testid="propose-title"
          class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-slate-300">Descripción</span>
        <textarea
          bind:value={description}
          required
          maxlength="300"
          rows="2"
          data-testid="propose-description"
          class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        ></textarea>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-slate-300">Condición (trigger_expr)</span>
        <input
          bind:value={triggerExpr}
          required
          maxlength="500"
          placeholder="wins_on_game >= 5"
          data-testid="propose-trigger"
          class="rounded-md border bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100
                 {triggerExpr.trim() && !exprValid ? 'border-rose-400' : 'border-slate-600'}"
        />
        <span class="text-[11px] text-slate-500">
          Variables disponibles: {STAT_HELP.join(", ")}. Operadores: {"&& || > < >= <= == !="}
        </span>
        {#if triggerExpr.trim() && !exprValid}
          <span class="text-[11px] text-rose-300" data-testid="trigger-invalid">
            Esa condición no es válida.
          </span>
        {/if}
      </label>

      {#if proposeError}
        <p class="text-xs text-rose-300">{proposeError}</p>
      {/if}
      {#if proposeSuccess}
        <p class="text-xs text-emerald-300">
          Propuesta enviada — queda pendiente de aprobación.
        </p>
      {/if}

      <button
        type="submit"
        disabled={proposing || !exprValid || !triggerExpr.trim()}
        data-testid="propose-submit"
        class="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {proposing ? "Enviando…" : "Enviar propuesta"}
      </button>
    </form>
  {/if}
{/if}
