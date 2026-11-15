<script setup lang="ts">
/** Compass rose and word mark; leads to the dashboard. `compact` drops the motto. */
import { useAppI18n } from "@/core/i18n";

import CompassRose from "./CompassRose.vue";

defineProps<{ compact?: boolean }>();
const { t } = useAppI18n();
</script>

<template>
  <RouterLink
    to="/dashboard"
    class="flex items-center gap-3 text-parchment"
    :aria-label="t('common.shell.toDashboard')"
  >
    <CompassRose :size="compact ? 40 : 46" />
    <span class="flex flex-col leading-tight">
      <span
        class="font-heading font-bold"
        :class="compact ? 'text-[24px]' : 'text-[26px]'"
      >{{ t("common.app.name") }}</span>
      <span
        v-if="!compact"
        class="text-[12.5px] whitespace-nowrap text-parchment/80"
      >{{ t("common.app.tagline") }}</span>
    </span>
  </RouterLink>
</template>
