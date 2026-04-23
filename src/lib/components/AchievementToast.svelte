<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import type { ToastAchievement } from "./AchievementToast.types.js";

  export let achievement: ToastAchievement;
  export let playerNickname: string | null = null;
  export let autoDismissMs: number = 4500;
  export let soundEnabled: boolean = true;

  const dispatch = createEventDispatcher<{ dismiss: { id: string } }>();

  const RARITY = {
    common: {
      label: "común",
      ring: "ring-slate-400/50",
      grad: "from-slate-500 to-slate-700",
      tone: 440,
    },
    rare: {
      label: "raro",
      ring: "ring-cyan-300/60",
      grad: "from-cyan-400 to-indigo-500",
      tone: 660,
    },
    epic: {
      label: "épico",
      ring: "ring-fuchsia-300/70",
      grad: "from-fuchsia-500 to-amber-400",
      tone: 880,
    },
  } as const;

  $: theme = RARITY[achievement.rarity];

  function dismiss(): void {
    dispatch("dismiss", { id: achievement.id });
  }

  function playTone(frequency: number): void {
    if (!soundEnabled) return;
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch {
      // Audio unavailable — silent failure is fine.
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  // Reactive block runs at component init (before mount in Svelte 4) and
  // every time autoDismissMs changes — schedule the dismiss timer once.
  $: if (autoDismissMs > 0 && timer === null) {
    timer = setTimeout(dismiss, autoDismissMs);
  }

  onMount(() => {
    playTone(theme.tone);
  });

  onDestroy(() => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  });
</script>

<div
  role="status"
  aria-live="polite"
  class="pointer-events-auto flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-slate-900/95 p-4 shadow-2xl ring-2 backdrop-blur {theme.ring}"
  data-testid="toast"
>
  <div class="flex items-center gap-2">
    <span
      class="rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white {theme.grad}"
      data-testid="rarity"
    >
      Logro {theme.label}
    </span>
    {#if playerNickname}
      <span class="text-xs text-slate-300" data-testid="player">
        para <strong class="text-slate-100">{playerNickname}</strong>
      </span>
    {/if}
    <button
      type="button"
      class="ml-auto rounded-md px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
      on:click={dismiss}
      data-testid="dismiss"
      aria-label="Cerrar logro"
    >
      ✕
    </button>
  </div>
  <h3 class="text-base font-semibold text-slate-100" data-testid="title">
    {achievement.title}
  </h3>
  <p class="text-sm leading-snug text-slate-300" data-testid="description">
    {achievement.description}
  </p>
</div>
