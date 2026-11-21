<script setup lang="ts">
/**
 * Registration through Clerk. While the waitlist is on, only people Clerk invited can register
 * (the invitation link carries its ticket here); everybody else is sent to the waitlist. The new
 * account takes this browser's language and time zone along (`unsafeMetadata`; the backend checks
 * them when it creates the local account).
 */
import { SignUp } from "@clerk/vue";
import { computed } from "vue";

import { useAppI18n } from "@/core/i18n";
import { usePageMeta } from "@/core/seo/pageMeta";
import BrandLayout from "@/layouts/BrandLayout.vue";

import ClerkPanel from "@/core/auth/ClerkPanel.vue";
import RotatingQuote from "../components/RotatingQuote.vue";
import { browserSettings } from "../form";
import { useAuthRedirect } from "../redirect";

const { t, locale } = useAppI18n();
usePageMeta({ title: () => t("auth.register.title"), description: () => t("auth.register.description") });
const { target } = useAuthRedirect();
const settings = computed(() => browserSettings(String(locale.value)));
</script>

<template>
  <BrandLayout
    :title="t('auth.register.title')"
    :subtitle="t('auth.register.subtitle')"
  >
    <RotatingQuote />

    <ClerkPanel>
      <SignUp
        routing="path"
        path="/registrieren"
        sign-in-url="/login"
        :fallback-redirect-url="target"
        :unsafe-metadata="settings"
      />
    </ClerkPanel>
  </BrandLayout>
</template>
