<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { RANDOM_VOTE, type RandomVote } from "$core/voting.js";
  import type { GamesRecord } from "$core/records.js";

  export let games: readonly GamesRecord[] = [];
  export let currentVote: string | RandomVote | null = null;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    vote: { gameId: string | RandomVote };
  }>();

  function pick(gameId: string | RandomVote): void {
    if (disabled) return;
    if (currentVote === gameId) return;
    dispatch("vote", { gameId });
  }

  $: randomSelected = currentVote === RANDOM_VOTE;
</script>

<div class="flex flex-col gap-3">
  <h2 class="text-base font-semibold text-slate-100">¿A qué jugamos?</h2>

  {#if games.length === 0}
    <p class="text-sm text-slate-400" data-testid="empty">
      No hay juegos elegibles para esta cantidad de jugadores.
    </p>
  {/if}

  <ul class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Voto de juego">
    {#each games as g (g.id)}
      {@const selected = currentVote === g.id}
      <li>
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          class="flex w-full flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors
                 {selected
                   ? 'border-cyan-300 bg-indigo-500/10'
                   : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'}"
          class:opacity-50={disabled}
          on:click={() => pick(g.id)}
          data-testid="vote-{g.id}"
          {disabled}
        >
          <span class="text-sm font-semibold text-slate-100">{g.name}</span>
          <span class="text-xs text-slate-400">
            {g.min_players}–{g.max_players} jugadores
          </span>
        </button>
      </li>
    {/each}

    <li class="col-span-2">
      <button
        type="button"
        role="radio"
        aria-checked={randomSelected}
        class="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-sm font-semibold transition-colors
               {randomSelected
                 ? 'border-cyan-300 bg-indigo-500/10 text-slate-100'
                 : 'border-slate-600 text-slate-300 hover:border-slate-400'}"
        class:opacity-50={disabled}
        on:click={() => pick(RANDOM_VOTE)}
        data-testid="vote-random"
        {disabled}
      >
        <span aria-hidden="true">🎲</span>
        Aleatorio
      </button>
    </li>
  </ul>
</div>
