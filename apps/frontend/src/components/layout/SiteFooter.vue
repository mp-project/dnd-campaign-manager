<script setup lang="ts">
/**
 * Footer of the pages outside the app (start page, FAQ, legal pages, sign-in): gothic ruins under
 * a golden circle whose mountain ridge rises into the section above, the page's closing content
 * on them and a bar with the links to privacy, imprint, FAQ and contact.
 * The content is the default slot; without one it is the call to action of the start page
 * (register or into the app, the demo, sign in). The section above must not clip vertically, so
 * the ridge can stand on it. `headingId` names the call's heading for `aria-labelledby`.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import { meQuery } from "@/core/auth/session";
import { demoUrl } from "@/core/demo";
import { useAppI18n } from "@/core/i18n";
import { useLocalizedPage } from "@/core/i18n/localizedRoutes";
import { vReveal } from "@/core/motion/reveal";

import footerArt from "./assets/footer-ruins.webp";
import CompassRose from "./CompassRose.vue";

withDefaults(defineProps<{ headingId?: string }>(), { headingId: "site-footer-title" });
defineSlots<{ default?(): unknown }>();

const { t } = useAppI18n();
const demo = demoUrl();
// Only what this tab already knows: public pages never ask the API.
const me = useQuery({ ...meQuery, enabled: false });
const signedIn = computed(() => !!me.data.value);
const faq = useLocalizedPage("landing-faq");
const contact = useLocalizedPage("contact");
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
          <CompassRose :size="56" />
          <span class="h-px w-16 bg-gold/70" />
        </div>
        <slot>
          <h2
            :id="headingId"
            class="mt-4 font-heading text-[28px] leading-tight font-bold text-parchment md:text-[36px]"
          >
            {{ t("common.siteFooter.title") }}
          </h2>
          <p class="mt-3 max-w-150 text-[17px] text-parchment/85">
            {{ t("common.siteFooter.text") }}
          </p>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <BaseButton
              v-if="signedIn"
              to="/dashboard"
              variant="primary"
              icon-right="aktion-weiter"
            >
              {{ t("common.siteFooter.toApp") }}
            </BaseButton>
            <BaseButton
              v-else
              :to="{ name: 'auth-register' }"
              variant="primary"
            >
              {{ t("common.siteFooter.register") }}
            </BaseButton>
            <BaseButton
              v-if="demo"
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
          <RouterLink
            v-if="!signedIn"
            :to="{ name: 'auth-login' }"
            class="mt-5 inline-flex min-h-11 items-center text-[15px] text-gold-light underline underline-offset-4"
          >
            {{ t("common.siteFooter.signIn") }}
          </RouterLink>
        </slot>
      </div>
    </div>

    <nav
      class="relative flex flex-wrap items-center justify-center gap-x-4 border-t border-navy-line/60 py-3 text-[14px] text-parchment/80"
      :aria-label="t('common.siteFooter.navLabel')"
    >
      <RouterLink
        :to="{ name: 'legal-privacy' }"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.legal.privacy") }}
      </RouterLink>
      <span
        class="h-4 w-px bg-navy-line"
        aria-hidden="true"
      />
      <RouterLink
        :to="{ name: 'legal-imprint' }"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.legal.imprint") }}
      </RouterLink>
      <span
        class="h-4 w-px bg-navy-line"
        aria-hidden="true"
      />
      <RouterLink
        :to="faq"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.siteFooter.faq") }}
      </RouterLink>
      <span
        class="h-4 w-px bg-navy-line"
        aria-hidden="true"
      />
      <RouterLink
        :to="contact"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.siteFooter.contact") }}
      </RouterLink>
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
