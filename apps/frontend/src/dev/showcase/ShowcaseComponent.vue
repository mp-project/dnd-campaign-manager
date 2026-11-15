<script setup lang="ts">
/** All variants of one component: its name as heading, variants in a two-column grid. */
defineProps<{ name: string; description?: string }>();
</script>

<template>
  <div class="flex flex-col gap-3">
    <div>
      <h3 class="font-heading text-[19px] text-heading">
        <code>{{ name }}</code>
      </h3>
      <p
        v-if="description"
        class="meta"
      >
        {{ description }}
      </p>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <slot />
    </div>
  </div>
</template>
