<script setup lang="ts">
/** One labelled variant; `dark` puts it on the navy app shell, `wide` spans the whole row. */
defineProps<{ label: string; dark?: boolean; wide?: boolean }>();
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-2"
    :class="wide && 'md:col-span-2'"
  >
    <p class="eyebrow text-ink-3">{{ label }}</p>
    <div
      class="flex min-w-0 flex-wrap items-center gap-3 rounded-card p-4"
      :class="dark ? 'bg-navy-950 text-parchment' : 'border border-dashed border-line bg-parchment-card/50'"
    >
      <slot />
    </div>
  </div>
</template>
