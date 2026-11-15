<script setup lang="ts">
/** Checkbox with label and optional description, 44 px touch target. */
const model = defineModel<boolean>({ default: false });
defineProps<{ label?: string; description?: string; disabled?: boolean }>();
</script>

<template>
  <label
    class="flex min-h-11 cursor-pointer items-start gap-3 py-2"
    :class="disabled && 'cursor-not-allowed opacity-50'"
  >
    <input
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      class="mt-0.5 size-5 shrink-0 accent-primary"
    >
    <span class="flex flex-col">
      <span>{{ label }}<slot /></span>
      <span
        v-if="description"
        class="meta"
      >{{ description }}</span>
    </span>
  </label>
</template>
