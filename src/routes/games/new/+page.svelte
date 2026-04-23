<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { user } from "$lib/stores/user.js";
  import type { CategoriesRecord } from "$core/records.js";

  let name = "";
  let description = "";
  let minPlayers = 2;
  let maxPlayers = 4;
  let pickedCategories = new Set<string>();
  let categories: CategoriesRecord[] = [];
  let pending = false;
  let error: string | null = null;

  onMount(async () => {
    if (!isAuthenticated()) {
      void goto("/auth");
      return;
    }
    try {
      categories = await collection("categories").getFullList({ sort: "name" });
    } catch {
      // categories are optional — surface in the form via empty list
    }
  });

  function toggleCategory(id: string): void {
    const next = new Set(pickedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    pickedCategories = next;
  }

  $: trimmedName = name.trim();
  $: nameOk = trimmedName.length >= 1 && trimmedName.length <= 80;
  $: rangeOk =
    Number.isFinite(minPlayers) &&
    Number.isFinite(maxPlayers) &&
    minPlayers >= 1 &&
    maxPlayers >= minPlayers;
  $: canSubmit = nameOk && rangeOk && !pending && !!$user;

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit || !$user) return;
    pending = true;
    error = null;
    try {
      const created = await collection("games").create({
        name: trimmedName,
        description: description.trim(),
        min_players: minPlayers,
        max_players: maxPlayers,
        categories: [...pickedCategories],
        owned_by: [$user.id],
        created_by: $user.id,
      });
      void goto(`/games`);
      // suppress unused var warning
      void created;
    } catch (err) {
      error = err instanceof Error ? err.message : "No pudimos crear el juego.";
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head><title>Nuevo juego · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/games" class="text-xs text-slate-400">← Catálogo</a>
  <h1 class="text-2xl font-bold text-slate-100">Agregar juego</h1>
  <p class="text-sm text-slate-400">
    Tras guardarlo, los logros se generan automáticamente con IA.
  </p>
</header>

<form class="flex flex-col gap-4" on:submit={submit}>
  <label class="flex flex-col gap-1 text-sm">
    <span class="text-slate-300">Nombre</span>
    <input
      type="text"
      bind:value={name}
      maxlength="80"
      data-testid="name"
      class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:border-cyan-300 focus:outline-none"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-slate-300">Descripción <span class="text-slate-500">(opcional)</span></span>
    <textarea
      bind:value={description}
      maxlength="500"
      rows="3"
      data-testid="description"
      class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-300 focus:outline-none"
    ></textarea>
  </label>

  <div class="grid grid-cols-2 gap-3">
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Mín. jugadores</span>
      <input
        type="number"
        min="1"
        max="20"
        bind:value={minPlayers}
        data-testid="min-players"
        class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:border-cyan-300 focus:outline-none"
      />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Máx. jugadores</span>
      <input
        type="number"
        min="1"
        max="20"
        bind:value={maxPlayers}
        data-testid="max-players"
        class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 focus:border-cyan-300 focus:outline-none"
      />
    </label>
  </div>

  {#if categories.length}
    <fieldset class="flex flex-col gap-2">
      <legend class="text-sm text-slate-300">Categorías</legend>
      <div class="flex flex-wrap gap-1.5">
        {#each categories as c (c.id)}
          {@const picked = pickedCategories.has(c.id)}
          <button
            type="button"
            on:click={() => toggleCategory(c.id)}
            data-testid="cat-{c.id}"
            class="rounded-full border px-3 py-1 text-xs transition-colors
                   {picked
                     ? 'border-cyan-300 bg-indigo-500/20 text-cyan-100'
                     : 'border-slate-600 text-slate-300 hover:border-slate-400'}"
          >
            {c.name}
          </button>
        {/each}
      </div>
    </fieldset>
  {/if}

  {#if error}
    <p class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="game-error">
      {error}
    </p>
  {/if}

  <button
    type="submit"
    disabled={!canSubmit}
    data-testid="submit"
    class="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
  >
    {pending ? "Guardando…" : "Guardar juego"}
  </button>
</form>
