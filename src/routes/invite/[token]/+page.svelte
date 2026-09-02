<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { collection } from "$lib/pb.js";
  import { weekdayLabelEs, timeSlotLabelEs } from "$core/matchmaking.js";
  import type { InvitesRecord, MatchProposalsRecord, PlayersRecord } from "$core/records.js";

  let invite: InvitesRecord | null = null;
  let proposal: MatchProposalsRecord | null = null;
  let host: PlayersRecord | null = null;
  let loading = true;
  let responding = false;
  let error: string | null = null;

  $: token = $page.params.token ?? "";

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const filter = `invite_token = "${token.replaceAll('"', "")}"`;
      const foundInvite = await collection("invites").getFirstListItem(filter);
      const foundProposal = await collection("match_proposals").getOne(foundInvite.proposal);
      const foundHost = await collection("players").getOne(foundProposal.host);
      invite = foundInvite;
      proposal = foundProposal;
      host = foundHost;
    } catch (err) {
      invite = null;
      error = "No encontramos esta invitación. Puede que ya haya vencido.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function respond(next: "accepted" | "declined"): Promise<void> {
    if (!invite || responding || invite.response !== "pending") return;
    responding = true;
    error = null;
    try {
      const updated = await collection("invites").update(
        invite.id,
        { response: next, responded_at: new Date().toISOString() },
        { query: { token } },
      );
      invite = updated;
    } catch (err) {
      error = "No se pudo registrar tu respuesta. Probá de nuevo.";
      console.error(err);
    } finally {
      responding = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Invitación · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <h1 class="text-2xl font-bold text-slate-100">Invitación a jugar</h1>
</header>

{#if loading}
  <p class="text-sm text-slate-400" data-testid="invite-loading">Cargando…</p>
{:else if error || !invite || !proposal || !host}
  <p class="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="invite-error">
    {error ?? "No encontramos esta invitación."}
  </p>
{:else}
  <section class="flex flex-col gap-4 rounded-2xl bg-slate-800/70 p-5">
    <p class="text-base text-slate-100">
      <strong>{host.nickname}</strong> puede hostear
      <strong>{weekdayLabelEs(proposal.weekday)}</strong> a la
      <strong>{timeSlotLabelEs(proposal.time_slot)}</strong> — ¿te sumas?
    </p>

    {#if invite.response === "pending"}
      <div class="flex gap-3">
        <button
          type="button"
          disabled={responding}
          data-testid="accept"
          class="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          on:click={() => respond("accepted")}
        >
          {responding ? "…" : "Acepto"}
        </button>
        <button
          type="button"
          disabled={responding}
          data-testid="decline"
          class="flex-1 rounded-full border border-slate-600 px-4 py-3 text-sm text-slate-200 disabled:opacity-50"
          on:click={() => respond("declined")}
        >
          No puedo
        </button>
      </div>
    {:else if invite.response === "accepted"}
      <p class="text-sm font-semibold text-emerald-300" data-testid="invite-status">
        ✓ Confirmaste. El host te va a mostrar un QR para entrar cuando se junten.
      </p>
    {:else}
      <p class="text-sm text-slate-400" data-testid="invite-status">Marcaste que no puedes esta vez.</p>
    {/if}

    {#if error}
      <p class="text-sm text-rose-200">{error}</p>
    {/if}
  </section>
{/if}
