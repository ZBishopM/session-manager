<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { SessionsRecord } from "$core/records.js";

  export let session: SessionsRecord | null;
  export let participantCount: number = 0;
  export let loading: boolean = false;
  export let error: string | null = null;
  export let joined: boolean = false;
  export let joining: boolean = false;

  const dispatch = createEventDispatcher<{ join: void }>();

  $: statusLabel =
    session?.status === "created"
      ? "Sala abierta"
      : session?.status === "active"
        ? "Sesión en curso"
        : session?.status === "ended"
          ? "Sesión terminada"
          : "—";
</script>

<section class="lobby">
  {#if loading}
    <p class="state" data-testid="state">Cargando sesión…</p>
  {:else if error}
    <p class="state error" data-testid="state-error">{error}</p>
  {:else if session}
    <header>
      <h2 data-testid="status">{statusLabel}</h2>
      <p class="muted">Token <code>{session.id}</code></p>
    </header>
    <div class="counter" data-testid="participant-count">
      <strong>{participantCount}</strong>
      <span>{participantCount === 1 ? "jugador" : "jugadores"} en la sala</span>
    </div>
    {#if joined}
      <p class="joined" data-testid="joined">Ya estás dentro ✓</p>
    {:else}
      <button
        class="join"
        type="button"
        data-testid="join"
        disabled={joining}
        on:click={() => dispatch("join")}
      >
        {joining ? "Entrando…" : "Entrar a la sesión"}
      </button>
    {/if}
  {:else}
    <p class="state" data-testid="state-empty">No se encontró la sesión.</p>
  {/if}
</section>

<style>
  .lobby {
    background: #1e293b;
    border-radius: 14px;
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .muted {
    margin: 0;
    opacity: 0.6;
    font-size: 0.78rem;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .counter {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
  }
  .counter strong {
    font-size: 1.6rem;
  }
  .counter span {
    opacity: 0.8;
    font-size: 0.85rem;
  }
  .join {
    margin-top: 0.25rem;
    padding: 0.7rem 1rem;
    border-radius: 999px;
    border: 0;
    background: linear-gradient(90deg, #6366f1, #22d3ee);
    color: white;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .join:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .joined {
    margin: 0.25rem 0 0;
    color: #7dd3a7;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .state {
    margin: 0;
    opacity: 0.7;
  }
  .state.error {
    color: #fca5a5;
    opacity: 1;
  }
</style>
