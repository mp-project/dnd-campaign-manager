<script setup lang="ts">
/** One group of building blocks on the showcase page, with an anchor for the table of contents. */
defineProps<{ id: string; title: string; description?: string }>();
</script>

<template>
  <section
    :id="id"
    class="flex scroll-mt-6 flex-col gap-5 border-t border-line pt-8"
  >
    <header>
      <h2 class="section-title text-[1.625rem]!">{{ title }}</h2>
      <p
        v-if="description"
        class="text-ink-2"
      >
        {{ description }}
      </p>
    </header>
    <slot />
  </section>
</template>
