<script setup lang="ts">
/**
 * A screenshot of the clickdummy in the golden frame of the work surface. With a demo the picture
 * leads to that screen of the demo in a new tab and says so when pointed at or focused. Loaded lazily.
 */
import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";

import { demoScreenUrl } from "@/core/demo";
import { SCREEN_HEIGHT, SCREEN_WIDTH, type Screen } from "../screens";

const props = defineProps<{ screen: Screen }>();
const { t } = useAppI18n();
const href = demoScreenUrl(props.screen.demoPath);
</script>

<template>
  <component
    :is="href ? 'a' : 'div'"
    :href="href ?? undefined"
    :target="href ? '_blank' : undefined"
    :rel="href ? 'noopener' : undefined"
    class="group relative block overflow-hidden rounded-card border border-gold bg-navy-950 shadow-soft"
  >
    <img
      :src="screen.src"
      :alt="t(screen.alt)"
      :width="SCREEN_WIDTH"
      :height="SCREEN_HEIGHT"
      loading="lazy"
      decoding="async"
      class="block h-auto w-full"
    >
    <span
      v-if="href"
      class="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full border border-gold bg-navy-950 px-3 py-1.5 text-[14px] text-gold-light opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      <Icon
        name="aktion-ansehen"
        :size="16"
      />
      {{ t("landing.screens.open") }}
    </span>
  </component>
</template>
