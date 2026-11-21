<script setup lang="ts">
/**
 * Development only: the preview picture of the public pages (Open Graph, 1200 × 630) as a page, so
 * `npm run og:images` photographs it into `public/og` in every variant. `start` carries the start
 * page's claim in the active language (`?lang=en`), `seite` only the brand for every other page.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";

import { useAppI18n } from "@/core/i18n";
import heroArt from "@/modules/landing/assets/deco/hero-dragon.webp";

const { t } = useAppI18n();
const route = useRoute();
const start = computed(() => route.params.variant !== "seite");
const logo = `${import.meta.env.BASE_URL}assets/brand/questaria-logo-hell.svg`;
</script>

<template>
  <div
    class="og"
    data-og-image
  >
    <img
      :src="heroArt"
      alt=""
      class="og-art"
    >
    <div class="og-shade" />
    <div class="og-text">
      <img
        :src="logo"
        :alt="t('common.app.name')"
        width="2227"
        height="682"
        class="w-auto"
        :class="start ? 'h-24' : 'h-36'"
      >
      <p
        class="eyebrow mt-6 text-gold-light"
        :class="start ? 'text-[22px]!' : 'text-[28px]!'"
      >
        {{ t("landing.hero.eyebrow") }}
      </p>
      <p
        v-if="start"
        class="mt-4 max-w-[36rem] font-heading text-[46px] leading-[1.15] font-bold text-balance text-parchment"
      >
        {{ t("landing.hero.title") }}
      </p>
      <span class="og-rule" />
    </div>
  </div>
</template>

<style scoped>
.og {
  position: relative;
  width: 1200px;
  height: 630px;
  overflow: hidden;
  background: var(--color-navy-950);
}
.og-art {
  position: absolute;
  inset: 0 0 0 auto;
  width: 82%;
  height: 100%;
  object-fit: cover;
  object-position: 70% 40%;
}
.og-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    var(--color-navy-950) 30%,
    color-mix(in srgb, var(--color-navy-950) 70%, transparent) 55%,
    transparent 85%
  );
}
.og-text {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.og-rule {
  display: block;
  width: 120px;
  height: 3px;
  margin-top: 32px;
  background: var(--color-gold);
}
.og::after {
  content: "";
  position: absolute;
  inset: 14px;
  border: 2px solid color-mix(in srgb, var(--color-gold) 70%, transparent);
  border-radius: 6px;
  pointer-events: none;
}
</style>
