<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { MatchPlayerInfo } from "./MatchResultSheet.types.js";

  export let players: readonly MatchPlayerInfo[] = [];
  export let initialDurationSeconds: number = 0;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    confirm: { winnerIds: string[]; durationSeconds: number; placements?: Record<string, number> };
  }>();

  let winnerIds: Set<string> = new Set();
  let durationSeconds = initialDurationSeconds;
  // Svelte binds a numeric <input> as a number, or "" when cleared — not a
  // plain string. Blank means "not ranked."
  let placements: Record<string, number | ""> = {};

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

  function parsedPlacements(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, raw] of Object.entries(placements)) {
      if (raw !== "" && Number.isFinite(raw) && raw >= 1) out[id] = raw;
    }
    return out;
  }

  function confirm(): void {
    if (disabled) return;
    const placementMap = parsedPlacements();
    const effectiveWinners = new Set(winnerIds);
    for (const [id, place] of Object.entries(placementMap)) {
      if (place === 1) effectiveWinners.add(id);
    }
    dispatch("confirm", {
      winnerIds: [...effectiveWinners],
      durationSeconds: Math.max(0, Math.floor(durationSeconds)),
      ...(Object.keys(placementMap).length > 0 ? { placements: placementMap } : {}),
    });
  }

  // Svelte's reactive-statement dependency tracking only sees variables
  // referenced directly here, not inside a called function — reference
  // `placements` itself rather than parsedPlacements() so this recomputes.
  $: anyWinner = winnerIds.size > 0 || Object.values(placements).some((v) => v === 1);
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

  <p class="text-xs text-slate-500">
    Opcional: si el juego se juega por puestos, escribe el puesto de cada jugador (1 = ganó).
  </p>

  <ul class="flex flex-col gap-2">
    {#each players as p (p.id)}
      {@const won = winnerIds.has(p.id)}
      <li class="flex items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={won}
          class="flex flex-1 items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors
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
        <input
          type="number"
          min="1"
          placeholder="Puesto"
          bind:value={placements[p.id]}
          {disabled}
          data-testid="placement-{p.id}"
          class="w-16 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 focus:border-cyan-300 focus:outline-none disabled:opacity-50"
        />
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
