<script lang="ts">
  import { goto } from "$app/navigation";
  import AuthForm from "$lib/components/AuthForm.svelte";
  import type { AuthMode } from "$lib/components/AuthForm.types.js";
  import { login, signup } from "$lib/auth.js";

  let mode: AuthMode = "login";
  let pending = false;
  let error: string | null = null;

  async function handleSubmit(
    event: CustomEvent<{ nickname: string; passcode: string; mode: AuthMode }>,
  ): Promise<void> {
    pending = true;
    error = null;
    try {
      const { nickname, passcode, mode: m } = event.detail;
      if (m === "signup") await signup(nickname, passcode);
      else await login(nickname, passcode);
      await goto("/profile");
    } catch (err) {
      error = parseError(err);
    } finally {
      pending = false;
    }
  }

  function handleModeChange(e: CustomEvent<{ mode: AuthMode }>): void {
    mode = e.detail.mode;
  }

  function parseError(err: unknown): string {
    if (err instanceof Error) {
      if (err.message.includes("validation")) return "Datos inválidos.";
      if (err.message.includes("Failed to authenticate")) return "Nickname o passcode incorrectos.";
      return err.message;
    }
    return "Error inesperado.";
  }
</script>

<svelte:head><title>Acceder · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <h1 class="text-2xl font-bold text-slate-100">
    {mode === "login" ? "Bienvenido de vuelta" : "Crea tu perfil"}
  </h1>
  <p class="text-sm text-slate-400">
    {mode === "login"
      ? "Entra con tu nickname y passcode."
      : "Elige un nickname único y un passcode de 4 dígitos."}
  </p>
</header>

<AuthForm
  bind:mode
  {pending}
  {error}
  on:submit={handleSubmit}
  on:mode-change={handleModeChange}
/>
