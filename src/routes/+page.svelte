<script lang="ts">
  import XpBar from "$lib/components/XpBar.svelte";
</script>

<h1>Session Manager</h1>
<p>Mobile-first board-game session tracker.</p>

<section>
  <h2>Demo: nivel 2 a mitad de camino al 3</h2>
  <XpBar xp={240} />
</section>

<style>
  h1 {
    font-size: 1.75rem;
    margin: 0.5rem 0 0.25rem;
  }
  p {
    opacity: 0.7;
    margin: 0 0 1.5rem;
  }
  section {
    background: #1e293b;
    border-radius: 12px;
    padding: 1rem;
  }
  h2 {
    font-size: 0.95rem;
    font-weight: 500;
    opacity: 0.8;
    margin: 0 0 0.75rem;
  }
</style>
