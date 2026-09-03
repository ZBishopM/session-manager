<script lang="ts">
  import { onMount } from "svelte";
  import GameCard from "$lib/components/GameCard.svelte";
  import { collection } from "$lib/pb.js";
  import type { CategoriesRecord, GamesRecord } from "$core/records.js";

  let games: GamesRecord[] = [];
  let categoriesById = new Map<string, string>();
  let loading = true;
  let error: string | null = null;

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const [gameList, catList] = await Promise.all([
        collection("games").getFullList({ sort: "name" }),
        collection("categories").getFullList(),
      ]);
      games = gameList;
      categoriesById = new Map(
        catList.map((c: CategoriesRecord) => [c.id, c.name]),
      );
    } catch (err) {
      error = err instanceof Error ? err.message : "No pudimos cargar el catálogo.";
    } finally {
      loading = false;
    }
  }

  function namesFor(ids: readonly string[] | undefined): string[] {
    if (!ids?.length) return [];
    return ids.map((id) => categoriesById.get(id) ?? "").filter(Boolean);
  }
</script>

<svelte:head><title>Catálogo · Session Manager</title></svelte:head>

<header class="mb-5 flex items-center justify-between gap-2">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <a
    href="/games/new"
    class="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-1.5 text-xs font-semibold text-white"
    data-testid="new-game"
  >
    + Nuevo juego
  </a>
</header>

<h1 class="mb-4 text-2xl font-bold text-slate-100">Catálogo</h1>

{#if loading}
  <p class="text-sm text-slate-400" data-testid="catalog-state">Cargando juegos…</p>
{:else if error}
  <p class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="catalog-error">
    {error}
  </p>
{:else if games.length === 0}
  <p class="text-sm text-slate-400" data-testid="catalog-empty">
    Aún no hay juegos. Sé el primero en agregar uno.
  </p>
{:else}
  <ul class="flex flex-col gap-3">
    {#each games as g (g.id)}
      <li>
        <a href="/games/{g.id}" class="block">
          <GameCard game={g} categoryNames={namesFor(g.categories)} />
        </a>
      </li>
    {/each}
  </ul>
{/if}
