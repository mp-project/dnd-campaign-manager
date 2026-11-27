<script setup lang="ts">
/**
 * Footer of the pages outside the app (start page, FAQ, roadmap, legal pages, sign-in): gothic
 * ruins under a golden circle whose mountain ridge rises into the section above, the wing seal and
 * the page's closing content on them and a bar with the links to privacy and imprint and, with Cookiebot, the cookie settings (FAQ, roadmap
 * and contact are in the header). The content is the default slot; without one it is the call to action of the start
 * page (pre-registration or into the app, the demo). The section above must not clip vertically,
 * so the ridge can stand on it. `headingId` names the call's heading for `aria-labelledby`.
 */
import { useRoute } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import { hasConsentManager, openConsentSettings } from "@/core/consent/consent";
import { useAppI18n } from "@/core/i18n";
import { vReveal } from "@/core/motion/reveal";
import { usePublicNavigation } from "@/core/navigation/publicNavigation";

import footerArt from "./assets/footer-ruins.webp";
import PublicNavLink from "./PublicNavLink.vue";
import WingSeal from "./WingSeal.vue";

withDefaults(defineProps<{ headingId?: string }>(), { headingId: "site-footer-title" });
defineSlots<{ default?(): unknown }>();

const { t } = useAppI18n();
const route = useRoute();
const { demo, signedIn, primary } = usePublicNavigation();
const LEGAL = [
  { name: "legal-privacy", label: "common.legal.privacy" },
  { name: "legal-imprint", label: "common.legal.imprint" },
] as const;
const consentManager = hasConsentManager();
</script>

<template>
  <footer class="site-footer relative z-0 text-parchment">
    <div class="closing relative flex items-center overflow-x-clip">
      <img
        :src="footerArt"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        class="closing-art pointer-events-none absolute"
      >
      <div
        v-reveal
        class="relative mx-auto flex w-full max-w-200 flex-col items-center px-4 pt-20 pb-16 text-center md:pt-28 md:pb-20"
      >
        <div
          class="flex items-center justify-center gap-4"
          aria-hidden="true"
        >
          <span class="h-px w-16 bg-gold/70" />
          <WingSeal :size="56" />
          <span class="h-px w-16 bg-gold/70" />
        </div>
        <slot>
          <h2
            :id="headingId"
            class="mt-4 font-heading text-[1.75rem] leading-tight font-bold text-parchment md:text-[2.25rem]"
          >
            {{ t("common.siteFooter.title") }}
          </h2>
          <p class="mt-3 max-w-150 text-[1.0625rem] text-parchment/85">
            {{ t("common.siteFooter.text") }}
          </p>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <BaseButton
              data-track="footer.primary"
              :data-track-detail="signedIn ? 'app' : 'waitlist'"
              :to="primary.to"
              variant="primary"
              :icon-right="signedIn ? 'aktion-weiter' : undefined"
            >
              {{ primary.label }}
            </BaseButton>
            <BaseButton
              v-if="demo"
              data-track="footer.demo"
              as="a"
              :href="demo"
              target="_blank"
              rel="noopener"
              variant="outline-gold"
              icon="aktion-ansehen"
            >
              {{ t("common.siteFooter.demo") }}
            </BaseButton>
          </div>
        </slot>
      </div>
    </div>

    <nav
      class="relative flex flex-wrap items-center justify-center gap-x-4 border-t border-navy-line/60 py-3 text-[0.875rem] text-parchment/80"
      :aria-label="t('common.siteFooter.navLabel')"
    >
      <template
        v-for="(page, index) in LEGAL"
        :key="page.name"
      >
        <span
          v-if="index > 0"
          class="h-4 w-px bg-navy-line"
          aria-hidden="true"
        />
        <PublicNavLink
          :data-track="`footer.${page.name}`"
          :to="{ name: page.name }"
          :active="route.name === page.name"
        >
          {{ t(page.label) }}
        </PublicNavLink>
      </template>
      <template v-if="consentManager">
        <span
          class="h-4 w-px bg-navy-line"
          aria-hidden="true"
        />
        <PublicNavLink
          data-track="footer.cookieSettings"
          @click="openConsentSettings"
        >
          {{ t("common.siteFooter.cookieSettings") }}
        </PublicNavLink>
      </template>
    </nav>
  </footer>
</template>

<style scoped>
.site-footer {
  background-color: var(--color-navy-950);
}

/*
 * Gothic ruins under a golden circle (1800 × 602). Rows above 22.2 % are the mountain ridge, which
 * rises into the section above; the rest carries the content and fades into the navy below.
 */
.closing {
  --closing-art-width: max(100vw, 1100px);
  min-height: calc(var(--closing-art-width) * 602 / 1800 * 0.778);
  overflow-y: visible;
}
.closing-art {
  top: 0;
  left: 50%;
  width: var(--closing-art-width);
  max-width: none;
  transform: translate(-50%, -22.2%);
  mask-image: linear-gradient(to bottom, black 65%, transparent);
}
</style>
