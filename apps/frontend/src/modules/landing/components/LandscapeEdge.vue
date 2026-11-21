<script setup lang="ts">
/**
 * A drawn landscape on the upper edge of a navy band: the hills stand on the band and rise into
 * the light section above, so the change of colour reads as a horizon instead of a cut. The
 * parent positions itself (`relative`) and must not clip vertically. `flip` mirrors it, so
 * neighbouring bands don't repeat the same picture; `landscape` picks the picture.
 */
import etchedHills from "../assets/deco/etched-hills.webp";
import hills from "../assets/deco/hills-path.webp";

/** `sink`: how far the picture reaches down into the band, as a share of its own height. */
const LANDSCAPES = {
  hills: { src: hills, sink: "0%" },
  etchedHills: { src: etchedHills, sink: "2%" },
} as const;

export type Landscape = keyof typeof LANDSCAPES;

withDefaults(defineProps<{ flip?: boolean; landscape?: Landscape }>(), { flip: false, landscape: "hills" });
</script>

<template>
  <img
    :src="LANDSCAPES[landscape].src"
    alt=""
    aria-hidden="true"
    loading="lazy"
    decoding="async"
    class="landscape-edge"
    :class="flip && 'is-flipped'"
    :style="{ '--sink': LANDSCAPES[landscape].sink }"
  >
</template>

<style scoped>
.landscape-edge {
  position: absolute;
  bottom: calc(100% - 1rem);
  left: 0;
  width: 180%;
  max-width: none;
  pointer-events: none;
  opacity: 0.9;
  transform: translateY(var(--sink));
}
/* On phones only one side shows: the trees, or mirrored the paved path. */
.landscape-edge.is-flipped {
  transform: translateY(var(--sink)) scaleX(-1);
}
@media (min-width: 768px) {
  .landscape-edge {
    bottom: calc(100% - 1.5rem);
    left: 50%;
    width: max(100%, 900px);
    transform: translate(-50%, var(--sink));
    mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  }
  .landscape-edge.is-flipped {
    transform: translate(-50%, var(--sink)) scaleX(-1);
  }
}
</style>
