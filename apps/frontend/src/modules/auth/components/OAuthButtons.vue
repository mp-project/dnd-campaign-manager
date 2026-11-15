<script setup lang="ts">
/**
 * Sign-in through Google or Discord. Both lead through the API to the provider; without an account
 * the provider's sign-in ends in the completion form of `/login/oauth`.
 */
import BaseButton from "@/components/base/BaseButton.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";

import { OAUTH_PROVIDERS, type OAuthProvider, oauthStartUrl } from "../api";

const props = defineProps<{ intent: "login" | "register"; redirect: string }>();
const { t } = useAppI18n();

const PROVIDER: Record<OAuthProvider, { name: string; icon: IconName }> = {
  GOOGLE: { name: "Google", icon: "ui-google" },
  DISCORD: { name: "Discord", icon: "ui-discord" },
};
</script>

<template>
  <div
    class="mt-5 flex items-center gap-3 text-ink-3"
    aria-hidden="true"
  >
    <span class="h-px flex-1 bg-line" /><span class="text-[14px]">{{ t("auth.oauth.or") }}</span><span class="h-px flex-1 bg-line" />
  </div>
  <div class="mt-4 grid gap-3 sm:grid-cols-2">
    <BaseButton
      v-for="provider in OAUTH_PROVIDERS"
      :key="provider"
      as="a"
      :href="oauthStartUrl(provider, props.intent, props.redirect)"
      :icon="PROVIDER[provider].icon"
    >
      {{ t("auth.oauth.with", { provider: PROVIDER[provider].name }) }}
    </BaseButton>
  </div>
  <p class="meta mt-2 text-center">
    {{ t("auth.oauth.hint") }}
  </p>
</template>
