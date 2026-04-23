<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { isAuthenticated } from "$lib/auth.js";
  import { collection } from "$lib/pb.js";
  import type { SessionsRecord } from "$core/records.js";
  import SessionLobby from "$lib/components/SessionLobby.svelte";

  let session: SessionsRecord | null = null;
  let participantCount = 0;
  let loading = true;
  let error: string | null = null;

  $: id = $page.params.id ?? "";

  onMount(() => {
    if (!isAuthenticated()) {
      void goto("/auth");
      return;
    }
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const found = await collection("sessions").getOne(id);
      const list = await collection("session_participants").getList(1, 1, {
        filter: `session = "${found.id}"`,
        skipTotal: false,
      });
      session = found;
      participantCount = list.totalItems;
    } catch (err) {
      session = null;
      error = "No encontramos esta sesión.";
      console.error(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Sesión · Session Manager</title></svelte:head>

<header class="mb-6 flex items-center justify-between gap-2">
  <a href="/" class="text-xs text-slate-400">← Inicio</a>
  <span class="text-xs text-slate-500">ID <code>{id.slice(0, 6)}…</code></span>
</header>

<SessionLobby {session} {participantCount} {loading} {error} />
