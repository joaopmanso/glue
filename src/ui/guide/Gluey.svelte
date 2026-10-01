<script lang="ts">
  /* Gluey (ADR 0126): GLUE's glue stick with a face and arms, the guide of the tours and the help centre. Drawn like
     the logo (GlueStick.svelte): the tube takes the theme's accent, the glue is cream. Poses: wave, point (to the
     right; \`flip\` points left), think, cheer. Bobs and blinks unless the system asks for less motion. */
  import type { Pose } from '../../core/guide/tours';
  let { size = 64, pose = 'wave', flip = false }: { size?: number; pose?: Pose; flip?: boolean } = $props();
  // Arms: [shoulder x, y] → [elbow] → [hand], per pose (the right arm is drawn; the left mirrors with its own path).
  const ARMS: Record<Pose, { r: string; l: string; hand: [number, number] | null }> = {
    wave: { r: 'M48 40 Q56 34 57 24', l: 'M16 42 Q10 48 12 56', hand: [57, 22] },
    point: { r: 'M48 40 Q58 40 66 36', l: 'M16 42 Q10 48 12 56', hand: [67, 35] },
    think: { r: 'M48 42 Q52 50 40 50', l: 'M16 42 Q10 48 12 56', hand: [39, 49] },
    cheer: { r: 'M48 38 Q56 30 58 20', l: 'M16 38 Q8 30 6 20', hand: [58, 18] },
  };
  const a = $derived(ARMS[pose]);
</script>

<svg class="gluey" class:flip data-pose={pose} viewBox="-4 0 76 84" width={size} height={size * 84 / 76} aria-hidden="true">
  <g class="bob">
    <!-- arms behind the body -->
    <path class="arm" d={a.l} />
    {#if pose === 'cheer'}<circle class="hand" cx="6" cy="18" r="3" />{/if}
    <!-- the glue, its drip, the collar -->
    <path class="glue" d="M18 22V12C18 7 24.5 4 32 4s14 3 14 8v10z" />
    <path class="glue" d="M37 20h5v9a2.5 2.5 0 0 1-5 0z" />
    <rect class="dark" x="15" y="21" width="34" height="5" rx="1.6" />
    <!-- the tube -->
    <rect class="body" x="15" y="25" width="34" height="42" rx="3" />
    <path class="glue" d="M37 25h5v7a2.5 2.5 0 0 1-5 0z" />
    <rect class="shine" x="18.5" y="28" width="2.6" height="9" rx="1.3" />
    <!-- the face -->
    <g class="eyes">
      <ellipse class="eye" cx="26" cy="41" rx="4.2" ry="4.8" />
      <ellipse class="eye" cx="38" cy="41" rx="4.2" ry="4.8" />
      <circle class="pupil" cx={pose === 'think' ? 27.5 : 26.8} cy={pose === 'think' ? 39.5 : 41.8} r="2" />
      <circle class="pupil" cx={pose === 'think' ? 39.5 : 38.8} cy={pose === 'think' ? 39.5 : 41.8} r="2" />
    </g>
    {#if pose === 'think'}<path class="mouth" d="M28 52.5h8" />
    {:else if pose === 'cheer'}<path class="mouth open" d="M26.5 50.5q5.5 7 11 0z" />
    {:else}<path class="mouth" d="M27 50.5q5 4.5 10 0" />{/if}
    <circle class="cheek" cx="21.5" cy="48.5" r="2.2" /><circle class="cheek" cx="42.5" cy="48.5" r="2.2" />
    <!-- the label band and the twist base -->
    <rect class="label" x="15" y="56" width="34" height="6" />
    <path class="dark" d="M16.5 67h31l-1.4 9H17.9z" />
    <path class="ridge" d="M23 67.5v8M28.5 67.5v8M34 67.5v8M39.5 67.5v8" />
    <!-- the arm in front, and its hand -->
    <path class="arm" d={a.r} />
    {#if a.hand}<circle class="hand" cx={a.hand[0]} cy={a.hand[1]} r="3" />{/if}
  </g>
</svg>

<style>
  .gluey { flex: none; overflow: visible; }
  .gluey.flip { transform: scaleX(-1); }
  .glue { fill: #f6f3e8; stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: .6; }
  .body { fill: var(--accent); }
  .dark { fill: color-mix(in srgb, var(--accent) 55%, var(--ground)); }
  .label { fill: #15140f; }
  .shine { fill: color-mix(in srgb, var(--accent) 45%, #fff); }
  .ridge { stroke: #15140f; stroke-width: 1; fill: none; }
  .eye { fill: #fff; }
  .pupil { fill: #15140f; }
  .mouth { fill: none; stroke: #15140f; stroke-width: 1.6; stroke-linecap: round; }
  .mouth.open { fill: #15140f; }
  .cheek { fill: #ff8a8a; opacity: .45; }
  .arm { fill: none; stroke: color-mix(in srgb, var(--accent) 70%, var(--ink)); stroke-width: 3; stroke-linecap: round; }
  .hand { fill: #f6f3e8; stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: .6; }
  @media (prefers-reduced-motion: no-preference) {
    .bob { animation: bob 3.2s ease-in-out infinite; transform-origin: 32px 76px; }
    .eyes { animation: blink 5s infinite; transform-origin: 32px 41px; }
    [data-pose="wave"] .bob { animation: bob 3.2s ease-in-out infinite, wiggle 1.6s ease-in-out 2; }
  }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
  @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
  @keyframes wiggle { 0%, 100% { rotate: 0deg; } 30% { rotate: -5deg; } 70% { rotate: 5deg; } }
</style>
