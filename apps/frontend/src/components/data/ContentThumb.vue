<script setup lang="ts">
/** Preview image of content: photos fill the box, cut-out images (items) are fitted on a dark ground. Size comes from the class. */
withDefaults(defineProps<{ src: string; alt?: string; contain?: boolean }>(), { alt: "" });
</script>

<template>
  <span
    class="block overflow-hidden rounded-[6px] border border-line"
    :class="contain ? 'bg-navy-900' : 'bg-parchment-sunk'"
  >
    <img
      :src="src"
      :alt="alt"
      class="size-full"
      :class="contain ? 'object-contain p-1' : 'object-cover'"
      loading="lazy"
    >
  </span>
</template>
