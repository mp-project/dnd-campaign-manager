<script setup lang="ts">
/** Figure card (dashboard, overviews): icon, label, value with tabular digits, optional hint. Without a card: StatTile. */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

defineProps<{ label: string; value: string | number; icon?: IconName; hint?: string; compact?: boolean }>();
</script>

<template>
  <div
    class="card flex items-center gap-3 px-4 py-3 md:gap-4"
    :class="!compact && 'md:px-5 md:py-4'"
  >
    <Icon
      v-if="icon"
      :name="icon"
      :size="compact ? 30 : 36"
      class="shrink-0 text-gold"
    />
    <div class="min-w-0">
      <p class="text-[0.9375rem] leading-tight font-semibold text-heading">
        {{ label }}
      </p>
      <p class="num font-heading text-[1.75rem] leading-tight font-bold text-brand md:text-heading">
        {{ value }}
      </p>
      <p
        v-if="hint"
        class="text-[0.84375rem] leading-snug text-ink-2 md:italic"
      >
        {{ hint }}
      </p>
    </div>
  </div>
</template>
