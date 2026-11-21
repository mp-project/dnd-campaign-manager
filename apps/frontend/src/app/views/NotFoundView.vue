<script setup lang="ts">
/**
 * Unknown address, or content the account may not see (the API answers both with 404), in the
 * brand layout of the public pages with their footer. Signed in, the way leads to the campaigns;
 * otherwise to the start page, with the FAQ and the contact form beside it. Saved at build time as
 * `dist/404.html`, which nginx sends with status 404 for every address outside the app's areas.
 * It asks the API nothing.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import { meQuery } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";
import { useHomePath, useLocalizedPage } from "@/core/i18n/localizedRoutes";
import { useErrorPageHead } from "@/core/seo/pageMeta";
import BrandLayout from "@/layouts/BrandLayout.vue";

const { t } = useAppI18n();
useErrorPageHead(() => t("common.notFound.title"));

const home = useHomePath();
const faq = useLocalizedPage("landing-faq");
const contact = useLocalizedPage("contact");
// Only what this tab already knows: the page must render without the API (prerendering).
const me = useQuery({ ...meQuery, enabled: false });
const signedIn = computed(() => !!me.data.value);
</script>

<template>
  <BrandLayout
    :title="t('common.notFound.title')"
    :subtitle="t('common.notFound.body')"
  >
    <div class="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
      <BaseButton
        v-if="signedIn"
        variant="primary"
        icon="nav-dashboard"
        to="/dashboard"
      >
        {{ t("common.notFound.back") }}
      </BaseButton>
      <BaseButton
        :variant="signedIn ? 'secondary' : 'primary'"
        icon="ui-house"
        :to="home"
      >
        {{ t("common.notFound.home") }}
      </BaseButton>
    </div>
    <p class="mt-6 text-center text-ink-2">
      {{ t("common.notFound.help") }}
    </p>
    <div class="mt-2 flex flex-wrap items-center justify-center gap-x-6">
      <RouterLink
        :to="faq"
        class="inline-flex min-h-11 items-center text-info underline underline-offset-4"
      >
        {{ t("common.publicNav.faq") }}
      </RouterLink>
      <RouterLink
        :to="contact"
        class="inline-flex min-h-11 items-center text-info underline underline-offset-4"
      >
        {{ t("common.publicNav.contact") }}
      </RouterLink>
    </div>
  </BrandLayout>
</template>
