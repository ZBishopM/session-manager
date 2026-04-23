<script lang="ts">
  import { qrCodeSvg } from "$lib/qr.js";

  export let data: string;

  let svgPromise: Promise<string> = qrCodeSvg(data);
  $: svgPromise = qrCodeSvg(data);
</script>

<div class="flex w-full justify-center" data-testid="qr-wrap">
  {#await svgPromise}
    <div class="aspect-square w-full max-w-[260px] animate-pulse rounded-2xl bg-slate-700"></div>
  {:then svg}
    <div
      class="aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl bg-white p-3"
      data-testid="qr"
    >
      {@html svg}
    </div>
  {:catch}
    <p class="text-sm text-rose-300">No se pudo generar el QR.</p>
  {/await}
</div>
