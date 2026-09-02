<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { user } from "$lib/stores/user.js";
  import { weekdayLabelEs, timeSlotLabelEs } from "$core/matchmaking.js";
  import type { InvitesRecord, MatchProposalsRecord, PlayersRecord } from "$core/records.js";

  interface InviteView {
    invite: InvitesRecord;
    proposal: MatchProposalsRecord;
    host: PlayersRecord | null;
  }

  let views: InviteView[] = [];
  let loading = true;
  let error: string | null = null;
  let respondingId: string | null = null;

  onMount(() => {
    if (!isAuthenticated()) {
      void goto(`/auth?next=${encodeURIComponent("/invites")}`);
      return;
    }
    void load();
  });

  async function load(): Promise<void> {
    if (!$user) return;
    loading = true;
    error = null;
    try {
      const invites = await collection("invites").getFullList({
        filter: `player = "${$user.id}"`,
        sort: "-created",
      });

      const next: InviteView[] = [];
      for (const invite of invites) {
        try {
          const proposal = await collection("match_proposals").getOne(invite.proposal);
          let host: PlayersRecord | null = null;
          try {
            host = await collection("players").getOne(proposal.host);
          } catch {
            // host account deleted since — still show the invite
          }
          next.push({ invite, proposal, host });
        } catch {
          // proposal deleted since — skip this invite
        }
      }
      views = next;
    } catch (err) {
      error = "No pudimos cargar tus invitaciones.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function respond(v: InviteView, next: "accepted" | "declined"): Promise<void> {
    if (respondingId || v.invite.response !== "pending") return;
    respondingId = v.invite.id;
    error = null;
    try {
      const updated = await collection("invites").update(
        v.invite.id,
        { response: next, responded_at: new Date().toISOString() },
        { query: { token: v.invite.invite_token } },
      );
      views = views.map((x) => (x.invite.id === updated.id ? { ...x, invite: updated } : x));
    } catch (err) {
      error = "No se pudo registrar tu respuesta.";
      console.error(err);
    } finally {
      respondingId = null;
    }
  }

  $: pending = views.filter((v) => v.invite.response === "pending");
  $: answered = views.filter((v) => v.invite.response !== "pending");
</script>

<svelte:head><title>Mis invitaciones · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/profile" class="text-xs text-slate-400">← Perfil</a>
  <h1 class="text-2xl font-bold text-slate-100">Mis invitaciones</h1>
</header>

{#if error}
  <p class="mb-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="invites-error">
    {error}
  </p>
{/if}

{#if loading}
  <p class="text-sm text-slate-400" data-testid="invites-loading">Cargando…</p>
{:else if views.length === 0}
  <p class="text-sm text-slate-400" data-testid="invites-empty">
    Todavía no te invitaron a nada. Marcá tu disponibilidad como jugador en
    <a href="/availability" class="underline">Mi disponibilidad</a> y esperá al domingo.
  </p>
{:else}
  {#if pending.length > 0}
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Pendientes</h2>
    <ul class="mb-6 flex flex-col gap-3">
      {#each pending as v (v.invite.id)}
        <li class="rounded-2xl bg-slate-800/70 p-4" data-testid="invite-{v.invite.id}">
          <p class="text-sm text-slate-100">
            <strong>{v.host?.nickname ?? "?"}</strong> puede hostear
            <strong>{weekdayLabelEs(v.proposal.weekday)}</strong> a la
            <strong>{timeSlotLabelEs(v.proposal.time_slot)}</strong> — ¿te sumás?
          </p>
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              disabled={respondingId === v.invite.id}
              data-testid="accept-{v.invite.id}"
              class="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              on:click={() => respond(v, "accepted")}
            >
              Acepto
            </button>
            <button
              type="button"
              disabled={respondingId === v.invite.id}
              data-testid="decline-{v.invite.id}"
              class="flex-1 rounded-full border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
              on:click={() => respond(v, "declined")}
            >
              No puedo
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if answered.length > 0}
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Respondidas</h2>
    <ul class="flex flex-col gap-2">
      {#each answered as v (v.invite.id)}
        <li
          class="flex items-center justify-between rounded-xl bg-slate-800/40 px-3 py-2.5 text-sm text-slate-300"
          data-testid="invite-{v.invite.id}"
        >
          <span>
            {v.host?.nickname ?? "?"} · {weekdayLabelEs(v.proposal.weekday)} {timeSlotLabelEs(v.proposal.time_slot)}
          </span>
          <span class={v.invite.response === "accepted" ? "text-emerald-300" : "text-slate-500"}>
            {v.invite.response === "accepted" ? "✓ aceptaste" : "no podés"}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
