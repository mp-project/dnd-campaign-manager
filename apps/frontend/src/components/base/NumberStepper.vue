<script setup lang="ts">
/** Counter with −/+ (resources, quantities, monster count), 44 px touch targets. Not for hit points. */
import { useAppI18n } from "@/core/i18n";

import Icon from "./Icon.vue";

const model = defineModel<number>({ default: 0 });
const props = withDefaults(
  defineProps<{ label: string; min?: number; max?: number; unit?: string; readonly?: boolean }>(),
  { min: 0 },
);
const { t } = useAppI18n();

function set(value: number): void {
  if (props.readonly) return;
  model.value = Math.min(props.max ?? Infinity, Math.max(props.min, value));
}
</script>

<template>
  <div
    class="inline-flex items-stretch overflow-hidden rounded-control border border-line bg-parchment-card"
    role="group"
    :aria-label="label"
  >
    <button
      v-if="!readonly"
      type="button"
      class="w-11 border-r border-line hover:bg-parchment-sunk disabled:opacity-40"
      :disabled="model <= min"
      :aria-label="t('common.stepper.decrease', { label })"
      @click="set(model - 1)"
    >
      <Icon
        name="ui-minus"
        :size="18"
        class="mx-auto"
      />
    </button>
    <span
      class="num flex min-h-11 min-w-14 items-center justify-center gap-1 px-3 whitespace-nowrap"
      aria-live="polite"
    >
      <b class="font-heading text-[1.0625rem] text-heading">{{ model }}</b>
      <span
        v-if="max != null"
        class="text-ink-2"
      >/ {{ max }}</span>
      <span
        v-if="unit"
        class="text-ink-2"
      >{{ unit }}</span>
    </span>
    <button
      v-if="!readonly"
      type="button"
      class="w-11 border-l border-line hover:bg-parchment-sunk disabled:opacity-40"
      :disabled="max != null && model >= max"
      :aria-label="t('common.stepper.increase', { label })"
      @click="set(model + 1)"
    >
      <Icon
        name="ui-plus"
        :size="18"
        class="mx-auto"
      />
    </button>
  </div>
</template>
