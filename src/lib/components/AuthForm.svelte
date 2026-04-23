<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { AuthMode } from "./AuthForm.types.js";

  export let mode: AuthMode = "login";
  export let pending: boolean = false;
  export let error: string | null = null;

  const dispatch = createEventDispatcher<{
    submit: { nickname: string; passcode: string; mode: AuthMode };
    "mode-change": { mode: AuthMode };
  }>();

  const modes: AuthMode[] = ["login", "signup"];
  let nickname = "";
  let passcode = "";

  $: trimmedNick = nickname.trim();
  $: nicknameOk = trimmedNick.length >= 2 && trimmedNick.length <= 24;
  $: passcodeOk = /^\d{4}$/.test(passcode);
  $: canSubmit = nicknameOk && passcodeOk && !pending;

  function setMode(next: AuthMode): void {
    if (mode === next) return;
    mode = next;
    error = null;
    dispatch("mode-change", { mode });
  }

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    if (!canSubmit) return;
    dispatch("submit", { nickname: trimmedNick, passcode, mode });
  }
</script>

<form class="flex flex-col gap-4" on:submit={submit}>
  <div
    class="grid grid-cols-2 rounded-full bg-slate-800 p-1 text-sm"
    role="tablist"
    aria-label="Modo de autenticación"
  >
    {#each modes as m (m)}
      {@const active = mode === m}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        class="rounded-full px-3 py-2 transition-colors
               {active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}"
        on:click={() => setMode(m)}
        data-testid="mode-{m}"
      >
        {m === "login" ? "Iniciar sesión" : "Crear perfil"}
      </button>
    {/each}
  </div>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-slate-300">Nickname</span>
    <input
      type="text"
      bind:value={nickname}
      placeholder="Ana"
      autocomplete="username"
      maxlength="24"
      data-testid="nickname"
      class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-slate-300">Passcode (4 dígitos)</span>
    <input
      type="password"
      inputmode="numeric"
      pattern="\d{4}"
      maxlength="4"
      bind:value={passcode}
      placeholder="••••"
      autocomplete="current-password"
      data-testid="passcode"
      class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-center text-2xl tracking-[0.5em] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none"
    />
  </label>

  {#if error}
    <p class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="auth-error">
      {error}
    </p>
  {/if}

  <button
    type="submit"
    disabled={!canSubmit}
    data-testid="submit"
    class="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
  >
    {#if pending}
      Cargando…
    {:else if mode === "login"}
      Entrar
    {:else}
      Crear perfil
    {/if}
  </button>
</form>
