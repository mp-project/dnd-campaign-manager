<script setup lang="ts">
/**
 * Header of every public page (start page, FAQ, roadmap, contact, legal pages, sign-in): the brand,
 * from lg on the links of the public navigation (`usePublicNavigation`, the page shown underlined)
 * and on the right the demo and the pre-registration (or the app) as buttons; the language switch
 * on pages that exist in several languages. Below lg the compass menu holds links and actions,
 * plus the page's `chapters`. It asks the API nothing, like the pages it sits on.
 */
import { useRoute } from "vue-router";
import { computed } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import { useAppI18n } from "@/core/i18n";
import { usePublicNavigation } from "@/core/navigation/publicNavigation";

import LanguageSwitch from "./LanguageSwitch.vue";
import PublicMenu, { type MenuChapter } from "./PublicMenu.vue";
import PublicNavLink from "./PublicNavLink.vue";
import SiteHeader from "./SiteHeader.vue";

withDefaults(defineProps<{ chapters?: readonly MenuChapter[]; condensed?: boolean }>(), {
  chapters: () => [],
  condensed: undefined,
});

const { t } = useAppI18n();
const route = useRoute();
const { links, demo, primary, signedIn } = usePublicNavigation();
/** Only pages made with `localizedRoutes` exist in more than one language. */
const multilingual = computed(() => !!route.meta.localizedName);
</script>

<template>
  <SiteHeader :condensed="condensed">
    <nav
      v-if="links.length"
      class="hidden items-center gap-4 text-[15px] lg:flex xl:gap-6"
      :aria-label="t('common.publicNav.label')"
    >
      <PublicNavLink
        v-for="link in links"
        :key="link.id"
        :data-track="`header.nav.${link.id}`"
        :to="link.to"
        :active="link.active"
      >
        {{ link.label }}
      </PublicNavLink>
    </nav>
    <LanguageSwitch v-if="multilingual" />
    <div class="hidden items-center gap-3 lg:flex">
      <BaseButton
        v-if="demo"
        data-track="header.demo"
        as="a"
        :href="demo"
        target="_blank"
        rel="noopener"
        variant="outline-gold"
        size="md"
      >
        {{ t("common.publicNav.demo") }}
      </BaseButton>
      <BaseButton
        data-track="header.primary"
        :data-track-detail="signedIn ? 'app' : 'waitlist'"
        :to="primary.to"
        variant="primary"
        size="md"
      >
        {{ primary.label }}
      </BaseButton>
    </div>
    <PublicMenu :chapters="chapters" />
  </SiteHeader>
</template>
