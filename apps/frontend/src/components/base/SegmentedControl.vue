<script setup lang="ts" generic="T extends string | number">
/** Segmented choice (radio group), e.g. comfortable/compact or by email/by link. */
import Icon from "./Icon.vue";
import type { IconName } from "./iconNames";

const model = defineModel<T>();
defineProps<{ options: Array<{ value: T; label: string; icon?: IconName }>; label: string }>();
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="grid auto-cols-fr grid-flow-col overflow-hidden rounded-control border border-line bg-parchment-card"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="min-h-11 px-4 text-[16px] whitespace-nowrap transition-colors"
      :class="model === option.value ? 'bg-primary text-parchment-card' : 'text-ink-2 hover:bg-parchment-sunk'"
      @click="model = option.value"
    >
      <Icon
        v-if="option.icon"
        :name="option.icon"
        :size="18"
        class="mr-1.5 inline align-[-3px]"
      />{{ option.label }}
    </button>
  </div>
</template>
