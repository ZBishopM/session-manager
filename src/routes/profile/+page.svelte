<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import XpBar from "$lib/components/XpBar.svelte";
  import { isAuthenticated, logout } from "$lib/auth.js";
  import { user } from "$lib/stores/user.js";
  import { collection } from "$lib/pb.js";

  onMount(() => {
    if (!isAuthenticated()) {
      void goto("/auth");
    }
  });

  function signOut(): void {
    logout();
    void goto("/");
  }

  let email = "";
  let savingEmail = false;
  let emailSaved = false;
  $: if ($user && email === "" && $user.email) email = $user.email;

  async function saveEmail(): Promise<void> {
    if (!$user || savingEmail) return;
    savingEmail = true;
    emailSaved = false;
    try {
      await collection("players").update($user.id, { email });
      emailSaved = true;
    } finally {
      savingEmail = false;
    }
  }

  let gamesWon: number | null = null;

  async function loadGamesWon(): Promise<void> {
    if (!$user) return;
    try {
      const result = await collection("match_players").getList(1, 1, {
        filter: `player = "${$user.id}" && won = true && match.status = "done"`,
      });
      gamesWon = result.totalItems;
    } catch (err) {
      console.error(err);
    }
  }

  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function generateClaimCode(): string {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  let pilesCode: string | null = null;
  let generatingCode = false;
  let pilesCodeCopied = false;

  async function linkPiles(): Promise<void> {
    if (!$user || generatingCode) return;
    generatingCode = true;
    pilesCodeCopied = false;
    try {
      // A player has at most one active code at a time — generating a new
      // one replaces (invalidates) whatever was linked before.
      const existing = await collection("piles_claims").getFullList({
        filter: `player = "${$user.id}"`,
      });
      for (const claim of existing) {
        await collection("piles_claims").delete(claim.id);
      }
      const code = generateClaimCode();
      await collection("piles_claims").create({ player: $user.id, code });
      pilesCode = code;
    } catch (err) {
      console.error(err);
    } finally {
      generatingCode = false;
    }
  }

  async function copyPilesCode(): Promise<void> {
    if (!pilesCode) return;
    try {
      await navigator.clipboard.writeText(pilesCode);
      pilesCodeCopied = true;
      setTimeout(() => (pilesCodeCopied = false), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  $: if ($user) void loadGamesWon();
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
        <p class="text-xs text-slate-400">
          Nivel {$user.level} · {$user.re_rolls ?? 0} re-rolls · {gamesWon ?? "…"} partidas ganadas
        </p>
      </div>
    </div>
    <XpBar xp={$user.xp ?? 0} />
  </section>

  <section class="mt-4 flex flex-col gap-2 rounded-2xl bg-slate-800/70 p-4">
    <label for="email" class="text-xs uppercase tracking-wide text-slate-400">
      Correo para notificaciones de matchmaking
    </label>
    <div class="flex gap-2">
      <input
        id="email"
        type="email"
        bind:value={email}
        on:input={() => (emailSaved = false)}
        placeholder="tu@correo.com"
        class="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
      />
      <button
        type="button"
        disabled={savingEmail}
        on:click={saveEmail}
        class="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {savingEmail ? "…" : "Guardar"}
      </button>
    </div>
    {#if emailSaved}
      <p class="text-xs text-emerald-300">Guardado.</p>
    {/if}
  </section>

  <section class="mt-4 flex flex-col gap-2 rounded-2xl bg-slate-800/70 p-4">
    <p class="text-xs uppercase tracking-wide text-slate-400">Vincular Piles</p>
    <p class="text-xs text-slate-400">
      Genera un código y escríbelo una vez en Piles — queda vinculado y suma el resultado de cada
      partida a este perfil hasta que generes un código nuevo o lo borres en Piles.
    </p>
    <button
      type="button"
      disabled={generatingCode}
      on:click={linkPiles}
      class="self-start rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {generatingCode ? "…" : "Generar código"}
    </button>
    {#if pilesCode}
      <div class="flex items-center gap-2">
        <p class="font-mono text-lg tracking-widest text-emerald-300" data-testid="piles-code">
          {pilesCode}
        </p>
        <button
          type="button"
          on:click={copyPilesCode}
          data-testid="copy-piles-code"
          class="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-400"
        >
          {pilesCodeCopied ? "Copiado" : "Copiar"}
        </button>
      </div>
    {/if}
  </section>

  <div class="mt-4 flex flex-col gap-2">
    <a
      href="/availability"
      class="flex flex-col gap-0.5 rounded-2xl bg-slate-800/70 p-4 text-slate-100 hover:bg-slate-800"
    >
      <p class="text-xs uppercase tracking-wide text-slate-400">Matchmaking</p>
      <p class="text-base font-semibold">Mi disponibilidad semanal</p>
    </a>
    <a
      href="/proposals"
      class="flex flex-col gap-0.5 rounded-2xl bg-slate-800/70 p-4 text-slate-100 hover:bg-slate-800"
    >
      <p class="text-xs uppercase tracking-wide text-slate-400">Matchmaking</p>
      <p class="text-base font-semibold">Mis propuestas de la semana</p>
    </a>
    <a
      href="/invites"
      class="flex flex-col gap-0.5 rounded-2xl bg-slate-800/70 p-4 text-slate-100 hover:bg-slate-800"
    >
      <p class="text-xs uppercase tracking-wide text-slate-400">Matchmaking</p>
      <p class="text-base font-semibold">Mis invitaciones</p>
    </a>
  </div>
{:else}
  <p class="text-sm text-slate-400">Cargando perfil…</p>
{/if}
