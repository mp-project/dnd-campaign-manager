<script setup lang="ts">
/**
 * The Questaria logo (dragon Q and word mark; for the navy surfaces it sits on the white ring and
 * word mark with the red, gold-contoured dragon) with the motto below; leads to the start page in the active language. `compact` drops the
 * motto and makes the logo smaller. The link's label names the brand, so the picture is
 * decoration. The files are in `public/assets/brand` (from the brand package).
 */
import { useAppI18n } from "@/core/i18n";
import { useHomePath } from "@/core/i18n/localizedRoutes";

defineProps<{ compact?: boolean }>();
const { t } = useAppI18n();
const home = useHomePath();
const logo = `${import.meta.env.BASE_URL}assets/brand/questaria-logo-hell.svg`;
</script>

<template>
  <RouterLink
    data-track="brand.home"
    :to="home"
    class="flex flex-col items-start text-parchment"
    :aria-label="t('common.shell.toHome')"
  >
    <img
      :src="logo"
      alt=""
      width="2227"
      height="682"
      class="w-auto"
      :class="compact ? 'h-9' : 'h-12 md:h-13'"
    >
    <span
      v-if="!compact"
      class="-mt-1 text-[0.78125rem] whitespace-nowrap text-gold-bright"
    >{{ t("common.app.tagline") }}</span>
  </RouterLink>
</template>
