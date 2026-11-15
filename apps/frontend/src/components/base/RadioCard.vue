<script setup lang="ts" generic="T extends string | number">
/** Choice card for radio groups (visibility, theme). `disabled` greys an option out (e.g. incompatible ruleset). */
import Icon from "./Icon.vue";
import type { IconName } from "./iconNames";

const model = defineModel<T>();
defineProps<{ value: T; label: string; description?: string; icon?: IconName; name?: string; disabled?: boolean }>();
</script>

<template>
  <label
    class="flex items-start gap-3 rounded-card border p-3 transition-colors"
    :class="
      disabled
        ? 'cursor-not-allowed border-line bg-parchment-sunk opacity-60'
        : model === value
          ? 'cursor-pointer border-primary bg-primary-soft/60'
          : 'cursor-pointer border-line bg-parchment-card hover:bg-parchment-sunk'
    "
  >
    <input
      v-model="model"
      type="radio"
      :name="name"
      :value="value"
      :disabled="disabled"
      class="mt-1 size-4 accent-primary"
    >
    <Icon
      v-if="icon"
      :name="icon"
      :size="22"
      class="mt-0.5 text-ink"
    />
    <span class="flex flex-col">
      <span class="font-medium">{{ label }}</span>
      <span
        v-if="description"
        class="meta"
      >{{ description }}</span>
      <slot />
    </span>
  </label>
</template>
