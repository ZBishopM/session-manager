<script lang="ts">
  import { page } from "$app/stores";
  import { collection } from "$lib/pb.js";

  $: token = $page.url.searchParams.get("token") ?? "";

  let passcode = "";
  let confirming = false;
  let error: string | null = null;
  let success = false;

  $: passcodeOk = /^\d{4}$/.test(passcode);

  function handlePasscodeInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    passcode = raw.replace(/\D/g, "").slice(0, 4);
  }

  async function confirm(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!token || !passcodeOk || confirming) return;
    confirming = true;
    error = null;
    try {
      await collection("players").confirmEmailChange(token, passcode);
      success = true;
    } catch (err) {
      error = "No se pudo confirmar. El enlace pudo vencer (30 min) o la contraseña no es correcta.";
      console.error(err);
    } finally {
      confirming = false;
    }
  }
</script>

<svelte:head><title>Confirmar correo · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/profile" class="text-xs text-slate-400">← Perfil</a>
  <h1 class="text-2xl font-bold text-slate-100">Confirmar correo</h1>
</header>

{#if !token}
  <p class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
    Este enlace no es válido. Pide un correo de confirmación nuevo desde tu perfil.
  </p>
{:else if success}
  <section class="flex flex-col gap-2 rounded-2xl bg-slate-800/70 p-5">
    <p class="text-sm text-emerald-300">✓ Correo confirmado.</p>
    <p class="text-xs text-slate-400">
      Por seguridad tu sesión anterior quedó cerrada. Vuelve a iniciar sesión.
    </p>
    <a
      href="/auth"
      class="mt-2 self-start rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white"
    >
      Iniciar sesión
    </a>
  </section>
{:else}
  <form class="flex flex-col gap-4 rounded-2xl bg-slate-800/70 p-5" on:submit={confirm}>
    <p class="text-sm text-slate-300">Escribe tu contraseña de 4 dígitos para confirmar.</p>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Contraseña</span>
      <input
        type="password"
        inputmode="numeric"
        pattern="\d*"
        maxlength="4"
        value={passcode}
        on:input={handlePasscodeInput}
        data-testid="confirm-passcode"
        class="w-24 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-center text-lg tracking-widest text-slate-100"
      />
    </label>
    {#if error}
      <p class="text-xs text-rose-300">{error}</p>
    {/if}
    <button
      type="submit"
      disabled={!passcodeOk || confirming}
      data-testid="confirm-submit"
      class="self-start rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
    >
      {confirming ? "Confirmando…" : "Confirmar"}
    </button>
  </form>
{/if}
