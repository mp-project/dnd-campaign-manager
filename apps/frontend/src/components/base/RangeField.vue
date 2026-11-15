<script setup lang="ts">
/** Slider with the label on the left and the value on the right (e.g. volume in %). */
import { computed, useId } from "vue";

const model = defineModel<number>({ default: 50 });
const props = withDefaults(
  defineProps<{ label: string; min?: number; max?: number; step?: number; unit?: string; hideLabel?: boolean }>(),
  { min: 0, max: 100, step: 1, unit: "%" },
);
const id = useId();
const progress = computed(() => `${((model.value - props.min) / (props.max - props.min || 1)) * 100}%`);
</script>

<template>
  <div
    class="grid items-center gap-3 md:gap-4"
    :class="hideLabel ? 'grid-cols-[1fr_auto]' : 'grid-cols-[minmax(0,8.5rem)_1fr_auto] md:grid-cols-[10rem_1fr_auto]'"
  >
    <label
      :for="id"
      class="text-[16px] text-ink"
      :class="hideLabel && 'sr-only'"
    >{{ label }}</label>
    <input
      :id="id"
      v-model.number="model"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      class="range"
      :style="{ '--progress': progress }"
    >
    <output
      :for="id"
      class="num min-w-16 rounded-control border border-line bg-parchment-card px-2 py-1 text-center text-[16px]"
    >{{ model }} {{ unit }}</output>
  </div>
</template>

<style scoped>
.range {
  appearance: none;
  width: 100%;
  min-height: 44px;
  background: transparent;
  cursor: pointer;
}
.range::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--color-primary) var(--progress), var(--color-neutral-soft) var(--progress));
}
.range::-moz-range-track {
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--color-primary) var(--progress), var(--color-neutral-soft) var(--progress));
}
.range::-webkit-slider-thumb {
  appearance: none;
  margin-top: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-parchment-card);
  border: 3px solid var(--color-primary);
}
.range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-parchment-card);
  border: 3px solid var(--color-primary);
}
.range:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
</style>
