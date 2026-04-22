<script lang="ts">
</script>

<main>
  <slot />
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #0f172a;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 1.25rem 1rem;
    min-height: 100vh;
  }
</style>
