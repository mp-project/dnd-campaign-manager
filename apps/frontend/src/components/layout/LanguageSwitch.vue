<script setup lang="ts">
/**
 * Language choice of a public page: a globe icon opening a menu with one entry per supported
 * language, each leading to the same page under its language's address (`/`, `/en`). The address
 * decides the language, so search engines and shared links see every language on its own. Only
 * for pages made with `localizedRoutes` (`PublicHeader` hides it elsewhere).
 */
import { type Locale, SUPPORTED_LOCALES } from "@dnd/i18n";
import { computed } from "vue";
import { useRoute } from "vue-router";

import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { localizedRouteName } from "@/core/i18n/localizedRoutes";

const { t } = useAppI18n();
const route = useRoute();

// i18n-dynamic: common.language.*
function nameOf(language: Locale): string {
  return t(`common.language.${language}` as MessageKey);
}

const items = computed<DropdownItem[]>(() => {
  const name = route.meta.localizedName ?? "landing";
  return SUPPORTED_LOCALES.map((language) => ({
    label: nameOf(language),
    to: { name: localizedRouteName(name, language), query: route.query, hash: route.hash },
    active: route.meta.locale === language,
  }));
});
</script>

<template>
  <DropdownMenu
    :items="items"
    dark
  >
    <template #trigger="{ toggle, open }">
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-full text-gold-bright transition-colors hover:bg-navy-800"
        :aria-label="t('common.publicNav.language')"
        :title="t('common.publicNav.language')"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="toggle"
      >
        <Icon
          name="ui-globe"
          :size="26"
        />
      </button>
    </template>
  </DropdownMenu>
</template>
