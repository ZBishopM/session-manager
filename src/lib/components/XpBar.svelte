<script lang="ts">
  import { progressToNextLevel } from "$core/xp.js";

  export let xp: number;

  $: progress = progressToNextLevel(xp);
  $: percent = Math.min(100, Math.max(0, progress.ratio * 100));
</script>

<div
  class="xp-bar"
  role="progressbar"
  aria-label="Progreso al siguiente nivel"
  aria-valuenow={progress.into}
  aria-valuemin={0}
  aria-valuemax={progress.needed}
>
  <div class="track">
    <div class="fill" style:width="{percent}%" data-testid="xp-fill"></div>
  </div>
  <div class="meta">
    <span class="level" data-testid="level">Nv {progress.level}</span>
    <span class="counter" data-testid="counter">
      {progress.into} / {progress.needed} XP
    </span>
  </div>
</div>

<style>
  .xp-bar {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .track {
    position: relative;
    height: 10px;
    background: rgba(148, 163, 184, 0.2);
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #22d3ee);
    border-radius: 999px;
    transition: width 350ms ease-out;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
  }
  .level {
    font-weight: 600;
  }
  .counter {
    opacity: 0.7;
  }
</style>
