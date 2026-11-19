<script setup lang="ts">
/**
 * Header of the start page and the FAQ: from md on the links to the demo and to the other page,
 * the language switch and the ways in (sign in and register, or the app for a profile already
 * loaded in this tab); on phones the compass menu with the page's `chapters`. It asks the API
 * nothing, like the pages it sits on.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import type { IconName } from "@/components/base/iconNames";
import SiteHeader from "@/components/layout/SiteHeader.vue";
import { meQuery } from "@/core/auth/session";
import { demoUrl } from "@/core/demo";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

import LandingMenu, { type MenuChapter } from "./LandingMenu.vue";
import LanguageSwitch from "./LanguageSwitch.vue";

defineProps<{
  chapters: readonly MenuChapter[];
  /** The other public page, shown as a link in the header and in the menu. */
  pageLink: { to: RouteLocationRaw; label: MessageKey; icon: IconName };
}>();

const { t } = useAppI18n();
const demo = demoUrl();
const me = useQuery({ ...meQuery, enabled: false });
const signedIn = computed(() => !!me.data.value);
</script>

<template>
  <SiteHeader>
    <RouterLink
      :to="pageLink.to"
      class="hidden min-h-11 items-center px-2 text-[15px] hover:underline md:inline-flex"
    >
      {{ t(pageLink.label) }}
    </RouterLink>
    <a
      v-if="demo"
      :href="demo"
      target="_blank"
      rel="noopener"
      class="hidden min-h-11 items-center px-2 text-[15px] hover:underline md:inline-flex"
    >
      {{ t("landing.header.demo") }}
    </a>
    <LanguageSwitch />
    <BaseButton
      v-if="signedIn"
      to="/dashboard"
      variant="outline-gold"
      size="sm"
      class="hidden md:inline-flex"
    >
      {{ t("landing.header.toApp") }}
    </BaseButton>
    <template v-else>
      <RouterLink
        :to="{ name: 'auth-login' }"
        class="hidden min-h-11 items-center px-2 text-[15px] hover:underline md:inline-flex"
      >
        {{ t("landing.header.signIn") }}
      </RouterLink>
      <BaseButton
        :to="{ name: 'auth-register' }"
        variant="outline-gold"
        size="sm"
        class="hidden md:inline-flex"
      >
        {{ t("landing.header.register") }}
      </BaseButton>
    </template>
    <LandingMenu
      :signed-in="signedIn"
      :demo="demo"
      :chapters="chapters"
      :page-link="pageLink"
    />
  </SiteHeader>
</template>
