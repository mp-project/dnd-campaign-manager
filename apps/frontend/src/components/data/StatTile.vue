<script setup lang="ts">
/** A figure with icon and label without a card (AC, HP, CR). For dashboard figures with a card: KpiCard. */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

defineProps<{ label: string; value: string | number; icon?: IconName; hint?: string }>();
</script>

<template>
  <div class="flex flex-col items-center px-3 py-2 text-center">
    <span class="flex items-center gap-2 text-[0.9375rem] text-ink"><Icon
      v-if="icon"
      :name="icon"
      :size="22"
    />{{ label }}</span>
    <span class="num font-heading text-[1.75rem] font-bold text-heading">{{ value }}</span>
    <span
      v-if="hint"
      class="meta"
    >{{ hint }}</span>
  </div>
</template>
