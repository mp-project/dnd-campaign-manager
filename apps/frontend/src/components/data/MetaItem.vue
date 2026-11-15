<script setup lang="ts">
/** Short fact with an icon for mobile records, tiles and table cells (hourglass + "1 Aktion"). `label` names the icon for screen readers. */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

withDefaults(defineProps<{ icon: IconName; label?: string; size?: number }>(), { label: undefined, size: 18 });
defineSlots<{ default(): unknown }>();
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1.5 leading-tight">
    <Icon
      :name="icon"
      :size="size"
      :label="label"
      class="shrink-0 text-ink"
    /><span class="min-w-0"><slot /></span>
  </span>
</template>
