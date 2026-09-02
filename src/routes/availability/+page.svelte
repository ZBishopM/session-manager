<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { user } from "$lib/stores/user.js";
  import { WEEKDAY_LABEL_ES, formatHourRange, type Weekday } from "$core/matchmaking.js";
  import type { AvailabilitiesRecord } from "$core/records.js";

  const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const WEEKDAY_SHORT_ES: Record<Weekday, string> = {
    mon: "Lu",
    tue: "Ma",
    wed: "Mi",
    thu: "Ju",
    fri: "Vi",
    sat: "Sá",
    sun: "Do",
  };
  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const CELL_HEIGHT_PX = 28;
  // Center the initial scroll around evening hours (board-game-night usage
  // pattern) instead of dumping the user at 00:00.
  const DEFAULT_SCROLL_HOUR = 15;

  let role: AvailabilitiesRecord["role"] = "player";
  let capacity = 4;
  let maxGroupSize = 6;
  let noGroupCap = true;

  /** "weekday:hour" keys currently toggled on the grid, not yet saved. */
  let selected = new Set<string>();
  let gridEl: HTMLDivElement;

  let mine: AvailabilitiesRecord[] = [];
  let loading = true;
  let saving = false;
  let error: string | null = null;

  onMount(async () => {
    if (!isAuthenticated()) {
      void goto(`/auth?next=${encodeURIComponent("/availability")}`);
      return;
    }
    if (gridEl) gridEl.scrollTop = DEFAULT_SCROLL_HOUR * CELL_HEIGHT_PX;
    await load();
  });

  async function load(): Promise<void> {
    if (!$user) return;
    loading = true;
    try {
      mine = await collection("availabilities").getFullList({
        filter: `player = "${$user.id}"`,
        sort: "weekday,start_hour,role",
      });
    } catch (err) {
      error = "No pudimos cargar tu disponibilidad.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function dayLabel(w: string): string {
    return WEEKDAY_LABEL_ES[w as Weekday] ?? w;
  }

  function cellKey(weekday: Weekday, hour: number): string {
    return `${weekday}:${hour}`;
  }

  function toggleCell(weekday: Weekday, hour: number): void {
    const key = cellKey(weekday, hour);
    if (selected.has(key)) {
      selected.delete(key);
    } else {
      selected.add(key);
    }
    selected = selected; // eslint-disable-line no-self-assign -- Svelte reactivity needs the assignment
  }

  /** Merges toggled hours into contiguous [start,end) ranges per weekday. */
  function selectionToRanges(): Array<{ weekday: Weekday; start_hour: number; end_hour: number }> {
    const ranges: Array<{ weekday: Weekday; start_hour: number; end_hour: number }> = [];
    for (const weekday of WEEKDAYS) {
      const hours = HOURS.filter((h) => selected.has(cellKey(weekday, h))).sort((a, b) => a - b);
      let rangeStart: number | null = null;
      let prev: number | null = null;
      for (const h of hours) {
        if (rangeStart === null) {
          rangeStart = h;
        } else if (prev !== null && h !== prev + 1) {
          ranges.push({ weekday, start_hour: rangeStart, end_hour: prev + 1 });
          rangeStart = h;
        }
        prev = h;
      }
      if (rangeStart !== null && prev !== null) {
        ranges.push({ weekday, start_hour: rangeStart, end_hour: prev + 1 });
      }
    }
    return ranges;
  }

  async function save(): Promise<void> {
    if (!$user || saving) return;
    const ranges = selectionToRanges();
    if (ranges.length === 0) return;
    saving = true;
    error = null;
    try {
      for (const r of ranges) {
        await collection("availabilities").create({
          player: $user.id,
          role,
          weekday: r.weekday,
          start_hour: r.start_hour,
          end_hour: r.end_hour,
          capacity: role === "host" ? capacity : undefined,
          max_group_size: role === "player" && !noGroupCap ? maxGroupSize : undefined,
        });
      }
      selected = new Set();
      await load();
    } catch (err) {
      // Unique index (player, role, weekday, start_hour, end_hour) — most
      // likely failure is an exact-duplicate block already saved.
      error = "No se pudo guardar. ¿Ya marcaste alguno de esos horarios?";
      console.error(err);
    } finally {
      saving = false;
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await collection("availabilities").delete(id);
      mine = mine.filter((a) => a.id !== id);
    } catch (err) {
      error = "No se pudo borrar.";
      console.error(err);
    }
  }
</script>

<svelte:head><title>Mi disponibilidad · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/profile" class="text-xs text-slate-400">← Perfil</a>
  <h1 class="text-2xl font-bold text-slate-100">Mi disponibilidad semanal</h1>
  <p class="text-sm text-slate-400">
    Toca las horas en las que puedes hostear (en tu casa) o sumarte como jugador. Todos los
    domingos el sistema junta hosts y jugadores compatibles y te avisa.
  </p>
</header>

{#if error}
  <p class="mb-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="avail-error">
    {error}
  </p>
{/if}

<div class="mb-4 flex gap-2" role="radiogroup" aria-label="Rol">
  <button
    type="button"
    class="flex-1 rounded-full border px-3 py-2 text-sm font-semibold transition-colors
           {role === 'host'
             ? 'border-cyan-300 bg-indigo-500/20 text-cyan-100'
             : 'border-slate-600 text-slate-300'}"
    data-testid="role-host"
    on:click={() => (role = "host")}
  >
    Host (mi casa)
  </button>
  <button
    type="button"
    class="flex-1 rounded-full border px-3 py-2 text-sm font-semibold transition-colors
           {role === 'player'
             ? 'border-cyan-300 bg-indigo-500/20 text-cyan-100'
             : 'border-slate-600 text-slate-300'}"
    data-testid="role-player"
    on:click={() => (role = "player")}
  >
    Jugador
  </button>
</div>

{#if role === "host"}
  <label class="mb-4 flex flex-col gap-1 text-sm">
    <span class="text-slate-300">¿Cuánta gente puedes recibir?</span>
    <input
      type="number"
      min="1"
      max="20"
      bind:value={capacity}
      data-testid="capacity"
      class="w-28 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100"
    />
  </label>
{:else}
  <label class="mb-2 flex items-center gap-2 text-sm text-slate-300">
    <input type="checkbox" bind:checked={noGroupCap} data-testid="no-group-cap" />
    No me importa el tamaño del grupo
  </label>
  {#if !noGroupCap}
    <label class="mb-4 flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Grupo máximo con el que te sumas</span>
      <input
        type="number"
        min="1"
        max="20"
        bind:value={maxGroupSize}
        data-testid="max-group-size"
        class="w-28 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100"
      />
    </label>
  {/if}
{/if}

<div
  bind:this={gridEl}
  class="mb-4 max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-slate-700"
  data-testid="availability-grid"
>
  <div class="grid" style="grid-template-columns: 3rem repeat(7, minmax(2.25rem, 1fr));">
    <div class="sticky top-0 z-10 bg-slate-900"></div>
    {#each WEEKDAYS as w (w)}
      <div class="sticky top-0 z-10 bg-slate-900 py-1 text-center text-xs font-semibold text-slate-300">
        {WEEKDAY_SHORT_ES[w]}
      </div>
    {/each}
    {#each HOURS as h (h)}
      <div
        class="flex items-center justify-end pr-1 text-[10px] text-slate-500"
        style="height: {CELL_HEIGHT_PX}px;"
      >
        {String(h).padStart(2, "0")}
      </div>
      {#each WEEKDAYS as w (w)}
        {@const key = cellKey(w, h)}
        <button
          type="button"
          aria-label="{dayLabel(w)} {h}:00"
          aria-pressed={selected.has(key)}
          data-testid="cell-{key}"
          class="border border-slate-800 transition-colors
                 {selected.has(key)
                   ? 'bg-gradient-to-br from-indigo-500 to-cyan-400'
                   : 'bg-slate-800/40 hover:bg-slate-700/60'}"
          style="height: {CELL_HEIGHT_PX}px;"
          on:click={() => toggleCell(w, h)}
        ></button>
      {/each}
    {/each}
  </div>
</div>

<button
  type="button"
  disabled={saving || selectionToRanges().length === 0}
  data-testid="save-availability"
  class="mb-8 w-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
  on:click={save}
>
  {saving ? "Guardando…" : "Guardar disponibilidad"}
</button>

<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Tu semana</h2>

{#if loading}
  <p class="text-sm text-slate-400" data-testid="avail-loading">Cargando…</p>
{:else if mine.length === 0}
  <p class="text-sm text-slate-400" data-testid="avail-empty">
    Todavía no marcaste ninguna disponibilidad.
  </p>
{:else}
  <ul class="flex flex-col gap-2">
    {#each mine as a (a.id)}
      <li
        class="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2.5 text-sm"
        data-testid="avail-{a.id}"
      >
        <span>
          <strong class="text-slate-100">{a.role === "host" ? "Host" : "Jugador"}</strong>
          <span class="text-slate-400">
            · {dayLabel(a.weekday)} {formatHourRange(a.start_hour, a.end_hour)}
            {#if a.role === "host" && a.capacity}
              · hasta {a.capacity}
            {:else if a.role === "player" && a.max_group_size}
              · máx. grupo {a.max_group_size}
            {:else if a.role === "player"}
              · sin límite de grupo
            {/if}
          </span>
        </span>
        <button
          type="button"
          class="text-xs text-rose-300 hover:text-rose-200"
          data-testid="remove-{a.id}"
          on:click={() => remove(a.id)}
        >
          Quitar
        </button>
      </li>
    {/each}
  </ul>
{/if}
