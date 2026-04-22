<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    MAX_PATTERN_LENGTH,
    MIN_PATTERN_LENGTH,
    canonicalizePattern,
  } from "$core/passcode.js";

  export let minPoints: number = MIN_PATTERN_LENGTH;
  export let maxPoints: number = MAX_PATTERN_LENGTH;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    change: { points: number[] };
    submit: { points: number[]; canonical: string };
  }>();

  let points: number[] = [];
  let error: string | null = null;

  $: complete = points.length >= minPoints;
  $: full = points.length >= maxPoints;

  function tap(i: number): void {
    if (disabled) return;
    if (points.includes(i)) return;
    if (full) return;
    points = [...points, i];
    error = null;
    dispatch("change", { points });
  }

  function clear(): void {
    points = [];
    error = null;
    dispatch("change", { points });
  }

  function submit(): void {
    if (disabled) return;
    error = null;
    try {
      const canonical = canonicalizePattern(points);
      dispatch("submit", { points, canonical });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  // Inlined positions map keeps Svelte reactivity tracking `points` directly
  // (a wrapper function would hide the dependency from the each block).
  $: positions = Array.from({ length: 9 }, (_, i) => points.indexOf(i));
</script>

<div class="flex flex-col items-stretch gap-4">
  <div
    class="grid aspect-square w-full max-w-xs grid-cols-3 grid-rows-3 gap-3 self-center"
    role="group"
    aria-label="Patrón táctil de 4 a 9 puntos"
  >
    {#each positions as order, i (i)}
      <button
        type="button"
        class="relative flex aspect-square items-center justify-center rounded-full border-2 transition-all duration-150 active:scale-95
               {order >= 0
                 ? 'border-cyan-300 bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-cyan-500/30'
                 : 'border-slate-600 bg-slate-800/60 hover:border-slate-400'}"
        class:opacity-50={disabled}
        on:click={() => tap(i)}
        data-testid="dot-{i}"
        aria-label={order >= 0 ? `Punto ${i}, posición ${order + 1}` : `Punto ${i}`}
        aria-pressed={order >= 0}
        {disabled}
      >
        {#if order >= 0}
          <span class="text-base font-semibold text-white" data-testid="order-{i}">
            {order + 1}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="flex items-center justify-between text-sm">
    <span class="text-slate-400" data-testid="counter">
      {points.length} / {maxPoints}
    </span>
    {#if error}
      <span class="text-rose-300" data-testid="pattern-error">{error}</span>
    {:else if !complete}
      <span class="text-slate-500" data-testid="hint">
        Mínimo {minPoints} puntos
      </span>
    {/if}
  </div>

  <div class="flex gap-2">
    <button
      type="button"
      class="flex-1 rounded-full border border-slate-600 px-4 py-3 text-sm font-medium text-slate-200 hover:border-slate-400 disabled:opacity-50"
      on:click={clear}
      disabled={disabled || points.length === 0}
      data-testid="clear"
    >
      Limpiar
    </button>
    <button
      type="button"
      class="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
      on:click={submit}
      disabled={disabled || !complete}
      data-testid="submit"
    >
      Confirmar
    </button>
  </div>
</div>
