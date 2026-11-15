<script setup lang="ts">
/**
 * Switch (role=switch), 44 px touch target. `switchLeft` puts the switch before the label;
 * `ariaLabel` replaces the label for screen readers (e.g. in tables).
 */
const model = defineModel<boolean>({ default: false });
defineProps<{ label?: string; description?: string; disabled?: boolean; switchLeft?: boolean; ariaLabel?: string }>();
</script>

<template>
  <label
    class="flex min-h-11 cursor-pointer items-center gap-4"
    :class="[disabled && 'opacity-50', switchLeft ? 'flex-row-reverse justify-end' : 'justify-between']"
  >
    <span class="flex flex-col">
      <span class="text-ink">{{ label }}<slot /></span>
      <span
        v-if="description"
        class="meta"
      >{{ description }}</span>
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="model"
      :disabled="disabled"
      :aria-label="ariaLabel ?? label"
      class="relative h-7 w-12 shrink-0 rounded-full border transition-colors"
      :class="model ? 'border-primary bg-primary' : 'border-line-strong bg-parchment-sunk'"
      @click="model = !model"
    >
      <span
        class="absolute top-0.5 size-[22px] rounded-full bg-parchment-card shadow-soft transition-all"
        :class="model ? 'left-[22px]' : 'left-0.5'"
      />
    </button>
  </label>
</template>
