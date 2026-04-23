<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import QrCode from "$lib/components/QrCode.svelte";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { generateQrToken, joinUrl } from "$lib/qr.js";
  import { user } from "$lib/stores/user.js";

  let pending = false;
  let error: string | null = null;
  let token: string | null = null;
  let sessionId: string | null = null;

  onMount(() => {
    if (!isAuthenticated()) {
      void goto("/auth");
    }
  });

  async function createSession(): Promise<void> {
    if (!$user) return;
    pending = true;
    error = null;
    try {
      const generated = generateQrToken();
      const session = await collection("sessions").create({
        host: $user.id,
        status: "created",
        qr_token: generated,
      });
      token = generated;
      sessionId = session.id;
    } catch (err) {
      error = err instanceof Error ? err.message : "Error inesperado.";
    } finally {
      pending = false;
    }
  }

  $: shareUrl = token
    ? joinUrl(token, typeof window === "undefined" ? "" : window.location.origin)
    : "";
</script>

<svelte:head><title>Hostear · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <h1 class="text-2xl font-bold text-slate-100">Hostear sesión</h1>
  <p class="text-sm text-slate-400">
    Crea una sala. Tus amigos escanean el QR para unirse.
  </p>
</header>

{#if !token}
  <button
    type="button"
    on:click={createSession}
    disabled={pending}
    data-testid="create-session"
    class="w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-4 text-base font-semibold text-white shadow-md disabled:opacity-50"
  >
    {pending ? "Creando…" : "Crear sesión"}
  </button>

  {#if error}
    <p class="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="host-error">
      {error}
    </p>
  {/if}
{:else}
  <section class="flex flex-col gap-4">
    <QrCode data={shareUrl} />
    <div class="flex flex-col gap-1 text-center text-xs text-slate-400">
      <span class="font-semibold uppercase tracking-wide text-slate-500">Código</span>
      <code class="text-sm font-bold text-slate-200">{token}</code>
    </div>
    <a
      href="/session/{sessionId}"
      class="rounded-full border border-slate-600 px-4 py-3 text-center text-sm text-slate-200 hover:border-slate-400"
      data-testid="goto-session"
    >
      Ir a la consola de la sesión →
    </a>
  </section>
{/if}
