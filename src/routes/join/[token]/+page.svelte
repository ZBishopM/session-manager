<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import type { SessionsRecord } from "$core/records.js";
  import { collection } from "$lib/pb.js";
  import { currentUser, isAuthenticated } from "$lib/auth.js";
  import SessionLobby from "$lib/components/SessionLobby.svelte";

  let session: SessionsRecord | null = null;
  let participantCount = 0;
  let joined = false;
  let joining = false;
  let loading = true;
  let error: string | null = null;

  $: token = $page.params.token ?? "";

  async function load() {
    loading = true;
    error = null;
    try {
      const filter = `qr_token = "${token.replaceAll('"', "")}"`;
      const found = await collection("sessions").getFirstListItem(filter);
      const list = await collection("session_participants").getList(1, 1, {
        filter: `session = "${found.id}"`,
        skipTotal: false,
      });
      session = found;
      participantCount = list.totalItems;

      const me = currentUser();
      if (me) {
        const mine = await collection("session_participants").getList(1, 1, {
          filter: `session = "${found.id}" && player = "${me.id}"`,
          skipTotal: false,
        });
        joined = mine.totalItems > 0;
      }
    } catch (err) {
      session = null;
      error = "No encontramos esta sesión. Pide al host un QR nuevo.";
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function handleJoin(): Promise<void> {
    if (!isAuthenticated()) {
      await goto(`/auth?next=${encodeURIComponent(`/join/${token}`)}`);
      return;
    }
    if (!session || joined || joining) return;
    joining = true;
    error = null;
    try {
      const me = currentUser()!;
      await collection("session_participants").create({
        session: session.id,
        player: me.id,
        status: "present",
        joined_at: new Date().toISOString(),
      });
      joined = true;
      await goto(`/session/${session.id}`);
    } catch (err) {
      error = "No se pudo unir a la sesión. Probá de nuevo.";
      console.error(err);
    } finally {
      joining = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Unirse a sesión</title></svelte:head>

<h1>Unirse a la sesión</h1>
<p class="muted">Token: <code>{token}</code></p>

<SessionLobby
  {session}
  {participantCount}
  {loading}
  {error}
  {joined}
  {joining}
  on:join={handleJoin}
/>

<style>
  h1 {
    font-size: 1.4rem;
    margin: 0.25rem 0 0.25rem;
  }
  .muted {
    margin: 0 0 1rem;
    opacity: 0.6;
    font-size: 0.8rem;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
