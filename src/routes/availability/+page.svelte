<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { user } from "$lib/stores/user.js";
  import type { AvailabilitiesRecord } from "$core/records.js";

  const WEEKDAYS: Array<{ value: AvailabilitiesRecord["weekday"]; label: string }> = [
    { value: "mon", label: "Lunes" },
    { value: "tue", label: "Martes" },
    { value: "wed", label: "Miércoles" },
    { value: "thu", label: "Jueves" },
    { value: "fri", label: "Viernes" },
    { value: "sat", label: "Sábado" },
    { value: "sun", label: "Domingo" },
  ];
  const SLOTS: Array<{ value: AvailabilitiesRecord["time_slot"]; label: string }> = [
    { value: "morning", label: "Mañana" },
    { value: "afternoon", label: "Tarde" },
    { value: "evening", label: "Noche" },
    { value: "night", label: "Madrugada" },
  ];

  let role: AvailabilitiesRecord["role"] = "player";
  let weekday: AvailabilitiesRecord["weekday"] = "sat";
  let timeSlot: AvailabilitiesRecord["time_slot"] = "afternoon";
  let capacity = 4;
  let maxGroupSize = 6;
  let noGroupCap = true;

  let mine: AvailabilitiesRecord[] = [];
  let loading = true;
  let pending = false;
  let error: string | null = null;

  onMount(async () => {
    if (!isAuthenticated()) {
      void goto(`/auth?next=${encodeURIComponent("/availability")}`);
      return;
    }
    await load();
  });

  async function load(): Promise<void> {
    if (!$user) return;
    loading = true;
    try {
      mine = await collection("availabilities").getFullList({
        filter: `player = "${$user.id}"`,
        sort: "weekday,time_slot,role",
      });
    } catch (err) {
      error = "No pudimos cargar tu disponibilidad.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function dayLabel(w: string): string {
    return WEEKDAYS.find((d) => d.value === w)?.label ?? w;
  }
  function slotLabel(s: string): string {
    return SLOTS.find((x) => x.value === s)?.label ?? s;
  }

  async function add(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!$user || pending) return;
    pending = true;
    error = null;
    try {
      await collection("availabilities").create({
        player: $user.id,
        role,
        weekday,
        time_slot: timeSlot,
        capacity: role === "host" ? capacity : undefined,
        max_group_size: role === "player" && !noGroupCap ? maxGroupSize : undefined,
      });
      await load();
    } catch (err) {
      // Unique index (player, role, weekday, time_slot) — most likely
      // failure is "you already posted this exact slot."
      error = "No se pudo guardar. ¿Ya marcaste ese rol+día+horario?";
      console.error(err);
    } finally {
      pending = false;
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
    Marca cuándo puedes hostear (en tu casa) o sumarte como jugador. Todos los domingos el sistema
    junta hosts y jugadores compatibles para ese horario y te avisa.
  </p>
</header>

{#if error}
  <p class="mb-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="avail-error">
    {error}
  </p>
{/if}

<form class="mb-8 flex flex-col gap-4" on:submit={add}>
  <div class="flex gap-2" role="radiogroup" aria-label="Rol">
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

  <div class="grid grid-cols-2 gap-3">
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Día</span>
      <select
        bind:value={weekday}
        data-testid="weekday"
        class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100"
      >
        {#each WEEKDAYS as d (d.value)}
          <option value={d.value}>{d.label}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Horario</span>
      <select
        bind:value={timeSlot}
        data-testid="time-slot"
        class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100"
      >
        {#each SLOTS as s (s.value)}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if role === "host"}
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">¿Cuánta gente puedes recibir?</span>
      <input
        type="number"
        min="1"
        max="20"
        bind:value={capacity}
        data-testid="capacity"
        class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100"
      />
    </label>
  {:else}
    <label class="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" bind:checked={noGroupCap} data-testid="no-group-cap" />
      No me importa el tamaño del grupo
    </label>
    {#if !noGroupCap}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-slate-300">Grupo máximo con el que te sumas</span>
        <input
          type="number"
          min="1"
          max="20"
          bind:value={maxGroupSize}
          data-testid="max-group-size"
          class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100"
        />
      </label>
    {/if}
  {/if}

  <button
    type="submit"
    disabled={pending}
    data-testid="add-availability"
    class="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
  >
    {pending ? "Guardando…" : "Agregar disponibilidad"}
  </button>
</form>

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
            · {dayLabel(a.weekday)} {slotLabel(a.time_slot)}
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
