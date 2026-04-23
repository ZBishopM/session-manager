<script lang="ts">
  import type { GamesRecord } from "$core/records.js";

  export let game: GamesRecord;
  export let categoryNames: readonly string[] = [];
</script>

<article
  class="flex flex-col gap-2 rounded-2xl bg-slate-800/70 p-4"
  data-testid="game-card-{game.id}"
>
  <header class="flex items-baseline justify-between gap-2">
    <h3 class="text-base font-semibold text-slate-100">{game.name}</h3>
    <span class="text-xs text-slate-400">
      {game.min_players}–{game.max_players}
    </span>
  </header>

  {#if game.description}
    <p class="line-clamp-2 text-sm text-slate-300">{game.description}</p>
  {/if}

  {#if categoryNames.length}
    <ul class="flex flex-wrap gap-1.5">
      {#each categoryNames as name (name)}
        <li
          class="rounded-full bg-slate-700/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300"
        >
          {name}
        </li>
      {/each}
    </ul>
  {/if}
</article>
