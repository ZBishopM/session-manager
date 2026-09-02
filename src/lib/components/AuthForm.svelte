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
  let passcodeTouched = false;

  $: trimmedNick = nickname.trim();
  $: nicknameOk = trimmedNick.length >= 2 && trimmedNick.length <= 24;
  $: passcodeOk = /^\d{4}$/.test(passcode);
  $: canSubmit = nicknameOk && passcodeOk && !pending;
  // "new-password" (not "current-password") in signup mode: a browser/
  // password manager only ever offers to *fill* a field marked
  // current-password, and it'll happily offer a saved password from a
  // totally different site — which then fails the 4-digit pattern check
  // with a confusing native "use the requested format" tooltip and no
  // in-app explanation. This is the actual bug behind that report.
  $: passcodeAutocomplete = mode === "signup" ? "new-password" : "current-password";

  function setMode(next: AuthMode): void {
    if (mode === next) return;
    mode = next;
    error = null;
    dispatch("mode-change", { mode });
  }

  // Sanitize on every input rather than trusting the native pattern/
  // maxlength alone — those don't stop a password manager (or a paste)
  // from putting a non-numeric or wrong-length value in the field; this
  // keeps `passcode` (and so passcodeOk/canSubmit) honest regardless of
  // how the value got there.
  function handlePasscodeInput(e: Event): void {
    const digitsOnly = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4);
    passcode = digitsOnly;
  }

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    passcodeTouched = true;
    if (!canSubmit) return;
    dispatch("submit", { nickname: trimmedNick, passcode, mode });
  }
</script>

<form class="flex flex-col gap-4" on:submit={submit} novalidate>
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
      value={passcode}
      on:input={handlePasscodeInput}
      on:blur={() => (passcodeTouched = true)}
      placeholder="••••"
      autocomplete={passcodeAutocomplete}
      data-testid="passcode"
      class="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-center text-2xl tracking-[0.5em] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none"
    />
    {#if passcodeTouched && passcode.length > 0 && !passcodeOk}
      <span class="text-xs text-rose-300" data-testid="passcode-hint">Tiene que ser exactamente 4 números.</span>
    {/if}
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
