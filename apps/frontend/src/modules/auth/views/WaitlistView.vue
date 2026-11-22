<script setup lang="ts">
/**
 * Pre-registration: the waitlist of Clerk's waitlist mode. Clerk keeps the address and sends the
 * invitation when access opens; the app stores nothing. Public page in every language
 * (`/warteliste`, `/en/warteliste`), the target of the pre-registration buttons.
 */
import { Waitlist } from "@clerk/vue";

import { useAppI18n } from "@/core/i18n";
import { usePageMeta } from "@/core/seo/pageMeta";
import BrandLayout from "@/layouts/BrandLayout.vue";

import ClerkPanel from "@/core/auth/ClerkPanel.vue";

const { t } = useAppI18n();
usePageMeta({ title: () => t("auth.waitlist.title"), description: () => t("auth.waitlist.description") });
</script>

<template>
  <BrandLayout
    :title="t('auth.waitlist.title')"
    :subtitle="t('auth.waitlist.subtitle')"
  >
    <p class="mb-5 text-ink-2">
      {{ t("auth.waitlist.lead") }}
    </p>

    <ClerkPanel>
      <Waitlist sign-in-url="/login" />
    </ClerkPanel>

    <p class="mt-5 text-sm text-ink-3">
      {{ t("auth.waitlist.privacyBefore") }}
      <RouterLink
        data-track="auth.waitlist.privacy"
        :to="{ name: 'legal-privacy' }"
        class="underline underline-offset-4"
      >
        {{ t("auth.waitlist.privacyLink") }}
      </RouterLink>{{ t("auth.waitlist.privacyAfter") }}
    </p>
  </BrandLayout>
</template>
