<script setup lang="ts">
/** Multi-line input in the Questaria style. */
const model = defineModel<string>();
withDefaults(defineProps<{ id?: string; placeholder?: string; rows?: number; invalid?: boolean }>(), { rows: 4 });
</script>

<template>
  <textarea
    :id="id"
    v-model="model"
    :rows="rows"
    :placeholder="placeholder"
    class="input"
    :aria-invalid="invalid || undefined"
  />
</template>
