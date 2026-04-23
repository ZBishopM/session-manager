<script lang="ts">
  import { isAuthenticated } from "$lib/auth.js";
  import { user } from "$lib/stores/user.js";
</script>

<svelte:head><title>Session Manager</title></svelte:head>

<section class="mb-6 flex flex-col gap-2">
  <h1 class="text-2xl font-bold text-slate-100">Session Manager</h1>
  <p class="text-sm text-slate-400">
    Gestiona tu próxima reunión de juegos de mesa: stats, votaciones y logros.
  </p>
</section>

<nav class="flex flex-col gap-3">
  {#if $user && isAuthenticated()}
    <a
      href="/profile"
      class="rounded-2xl bg-slate-800/70 p-4 text-slate-100 hover:bg-slate-800"
    >
      <p class="text-xs uppercase tracking-wide text-slate-400">Tu perfil</p>
      <p class="mt-0.5 text-base font-semibold">{$user.nickname}</p>
      <p class="text-xs text-slate-400">Nivel {$user.level}</p>
    </a>
    <a
      href="/host"
      class="rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 p-4 text-white"
    >
      <p class="text-xs font-medium uppercase tracking-wide opacity-80">Hostear</p>
      <p class="mt-0.5 text-base font-semibold">Iniciar nueva sesión</p>
    </a>
  {:else}
    <a
      href="/auth"
      class="rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 p-4 text-white"
    >
      <p class="text-xs font-medium uppercase tracking-wide opacity-80">Empieza</p>
      <p class="mt-0.5 text-base font-semibold">Crear perfil o iniciar sesión</p>
      <p class="text-xs opacity-80">Solo necesitas un nickname y un passcode de 4 dígitos.</p>
    </a>
  {/if}
</nav>
