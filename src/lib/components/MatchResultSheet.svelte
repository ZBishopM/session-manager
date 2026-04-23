<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { MatchPlayerInfo } from "./MatchResultSheet.types.js";

  export let players: readonly MatchPlayerInfo[] = [];
  export let initialDurationSeconds: number = 0;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    confirm: { winnerIds: string[]; durationSeconds: number };
  }>();

  let winnerIds: Set<string> = new Set();
  let durationSeconds = initialDurationSeconds;

  function toggleWinner(id: string): void {
    if (disabled) return;
    const next = new Set(winnerIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    winnerIds = next;
  }

  function format(s: number): string {
    const safe = Math.max(0, Math.floor(s));
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  function confirm(): void {
    if (disabled) return;
    dispatch("confirm", {
      winnerIds: [...winnerIds],
      durationSeconds: Math.max(0, Math.floor(durationSeconds)),
    });
  }

  $: anyWinner = winnerIds.size > 0;
</script>

<section class="flex flex-col gap-4 rounded-2xl bg-slate-800/70 p-4">
  <header class="flex flex-col gap-1">
    <h2 class="text-base font-semibold text-slate-100">Registrar resultado</h2>
    <p class="text-xs text-slate-400">
      Marca a los ganadores. En juegos por equipos puede ganar más de uno.
    </p>
  </header>

  <label class="flex items-center justify-between gap-3 text-sm text-slate-200">
    <span>Duración</span>
    <span class="flex items-center gap-2">
      <input
        type="number"
        min="0"
        step="1"
        bind:value={durationSeconds}
        {disabled}
        data-testid="duration-input"
        class="w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-cyan-300 focus:outline-none"
      />
      <span class="font-mono text-xs text-slate-400" data-testid="duration-display">
        {format(durationSeconds)}
      </span>
    </span>
  </label>

  <ul class="flex flex-col gap-2">
    {#each players as p (p.id)}
      {@const won = winnerIds.has(p.id)}
      <li>
        <button
          type="button"
          role="checkbox"
          aria-checked={won}
          class="flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors
                 {won
                   ? 'border-emerald-300 bg-emerald-500/10 text-emerald-100'
                   : 'border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-500'}"
          class:opacity-50={disabled}
          on:click={() => toggleWinner(p.id)}
          data-testid="winner-{p.id}"
          {disabled}
        >
          <span class="font-medium">{p.nickname}</span>
          <span class="text-xs uppercase tracking-wide" data-testid="winner-status-{p.id}">
            {won ? "ganó 🏆" : "perdió"}
          </span>
        </button>
      </li>
    {/each}
  </ul>

  <button
    type="button"
    class="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
    on:click={confirm}
    disabled={disabled || !anyWinner}
    data-testid="confirm"
  >
    Confirmar resultado
  </button>
</section>
