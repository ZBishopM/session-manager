<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import { user } from "$lib/stores/user.js";
  import { generateQrToken } from "$lib/qr.js";
  import { weekdayLabelEs, timeSlotLabelEs } from "$core/matchmaking.js";
  import type { MatchProposalsRecord, InvitesRecord, PlayersRecord } from "$core/records.js";

  interface ProposalView {
    proposal: MatchProposalsRecord;
    invites: InvitesRecord[];
    players: Map<string, PlayersRecord>;
  }

  let views: ProposalView[] = [];
  let loading = true;
  let error: string | null = null;
  let startingId: string | null = null;

  onMount(() => {
    if (!isAuthenticated()) {
      void goto(`/auth?next=${encodeURIComponent("/proposals")}`);
      return;
    }
    void load();
  });

  async function load(): Promise<void> {
    if (!$user) return;
    loading = true;
    error = null;
    try {
      const proposals = await collection("match_proposals").getFullList({
        filter: `host = "${$user.id}" && status = "proposed"`,
        sort: "proposed_date",
      });

      const next: ProposalView[] = [];
      for (const proposal of proposals) {
        const invites = await collection("invites").getFullList({
          filter: `proposal = "${proposal.id}"`,
        });
        const players = new Map<string, PlayersRecord>();
        for (const inv of invites) {
          if (players.has(inv.player)) continue;
          try {
            players.set(inv.player, await collection("players").getOne(inv.player));
          } catch {
            // player deleted since — skip, just show the id
          }
        }
        next.push({ proposal, invites, players });
      }
      views = next;
    } catch (err) {
      error = "No pudimos cargar tus propuestas.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function acceptedCount(v: ProposalView): number {
    return v.invites.filter((i) => i.response === "accepted").length;
  }

  async function startSession(v: ProposalView): Promise<void> {
    if (!$user || startingId) return;
    startingId = v.proposal.id;
    error = null;
    try {
      const qrToken = generateQrToken();
      const session = await collection("sessions").create({
        host: $user.id,
        status: "created",
        qr_token: qrToken,
      });
      await collection("match_proposals").update(v.proposal.id, {
        status: "confirmed",
        session: session.id,
      });
      await goto(`/session/${session.id}`);
    } catch (err) {
      error = "No se pudo crear la sesión.";
      console.error(err);
      startingId = null;
    }
  }
</script>

<svelte:head><title>Mis propuestas · Session Manager</title></svelte:head>

<header class="mb-6 flex flex-col gap-1">
  <a href="/profile" class="text-xs text-slate-400">← Perfil</a>
  <h1 class="text-2xl font-bold text-slate-100">Mis propuestas de la semana</h1>
  <p class="text-sm text-slate-400">
    Generadas automáticamente cada domingo a partir de tu disponibilidad como host.
  </p>
</header>

{#if error}
  <p class="mb-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-testid="proposals-error">
    {error}
  </p>
{/if}

{#if loading}
  <p class="text-sm text-slate-400" data-testid="proposals-loading">Cargando…</p>
{:else if views.length === 0}
  <p class="text-sm text-slate-400" data-testid="proposals-empty">
    No tienes propuestas activas todavía. Marca tu disponibilidad como host en
    <a href="/availability" class="underline">Mi disponibilidad</a> y espera al domingo.
  </p>
{:else}
  <ul class="flex flex-col gap-4">
    {#each views as v (v.proposal.id)}
      <li class="rounded-2xl bg-slate-800/70 p-4" data-testid="proposal-{v.proposal.id}">
        <p class="text-base font-semibold text-slate-100">
          {weekdayLabelEs(v.proposal.weekday)} a la {timeSlotLabelEs(v.proposal.time_slot)}
        </p>
        <ul class="mt-2 flex flex-col gap-1 text-sm">
          {#each v.invites as inv (inv.id)}
            {@const p = v.players.get(inv.player)}
            <li class="flex items-center justify-between text-slate-300">
              <span>{p?.nickname ?? inv.player}</span>
              <span
                class={inv.response === "accepted"
                  ? "text-emerald-300"
                  : inv.response === "declined"
                    ? "text-slate-500"
                    : "text-amber-300"}
              >
                {inv.response === "accepted" ? "✓ acepta" : inv.response === "declined" ? "no puede" : "esperando…"}
              </span>
            </li>
          {/each}
        </ul>
        <button
          type="button"
          disabled={acceptedCount(v) === 0 || startingId === v.proposal.id}
          data-testid="start-from-proposal-{v.proposal.id}"
          class="mt-3 w-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          on:click={() => startSession(v)}
        >
          {startingId === v.proposal.id
            ? "Creando…"
            : acceptedCount(v) === 0
              ? "Esperando confirmaciones"
              : `Crear sesión y mostrar QR (${acceptedCount(v)} confirmaron)`}
        </button>
      </li>
    {/each}
  </ul>
{/if}
