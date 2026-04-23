<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import XpBar from "$lib/components/XpBar.svelte";
  import { isAuthenticated, logout } from "$lib/auth.js";
  import { user } from "$lib/stores/user.js";

  onMount(() => {
    if (!isAuthenticated()) {
      void goto("/auth");
    }
  });

  function signOut(): void {
    logout();
    void goto("/");
  }
</script>

<svelte:head><title>Perfil · Session Manager</title></svelte:head>

<header class="mb-6 flex items-center justify-between gap-2">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <button
    type="button"
    on:click={signOut}
    class="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:border-slate-400"
  >
    Cerrar sesión
  </button>
</header>

{#if $user}
  <section class="flex flex-col gap-5 rounded-2xl bg-slate-800/70 p-5">
    <div class="flex items-center gap-4">
      <div
        class="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-xl font-bold text-white"
      >
        {$user.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div class="flex flex-col">
        <h1 class="text-xl font-semibold text-slate-100">{$user.nickname}</h1>
        <p class="text-xs text-slate-400">Nivel {$user.level} · {$user.re_rolls ?? 0} re-rolls</p>
      </div>
    </div>
    <XpBar xp={$user.xp ?? 0} />
  </section>
{:else}
  <p class="text-sm text-slate-400">Cargando perfil…</p>
{/if}
