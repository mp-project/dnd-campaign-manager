<script setup lang="ts">
/**
 * Sign-in through Clerk (email and password, Google, Discord; codes and second factors are Clerk's
 * own steps under `/login/…`). `?signedOut=partial` says that signing out everywhere failed and
 * only this browser is signed out. `?noAccess=1` comes from the guard when Clerk has a session but
 * the API refuses its account (locked, disabled, address of another account): the page says so and
 * offers to sign out instead of the sign-in, which would only send the session back. Afterwards the
 * page from `?redirect=` follows (only paths of this app), else the dashboard.
 */
import { SignIn } from "@clerk/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import ClerkPanel from "@/core/auth/ClerkPanel.vue";
import { signOut } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";
import { usePageMeta } from "@/core/seo/pageMeta";
import BrandLayout from "@/layouts/BrandLayout.vue";

import RotatingQuote from "../components/RotatingQuote.vue";
import { useAuthRedirect } from "../redirect";

const { t } = useAppI18n();
usePageMeta({ title: () => t("auth.login.title"), description: () => t("auth.login.description") });
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { target } = useAuthRedirect();
const signedOutPartially = computed(() => route.query.signedOut === "partial");
const noAccess = computed(() => route.query.noAccess === "1");
const busy = ref(false);

async function useOtherAccount(): Promise<void> {
  busy.value = true;
  try {
    await signOut(queryClient).catch(() => undefined);
    await router.replace({ name: "auth-login" });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BrandLayout
    :title="t('auth.login.title')"
    :subtitle="t('auth.login.subtitle')"
  >
    <RotatingQuote />

    <InfoNote
      v-if="signedOutPartially"
      tone="danger"
      class="mb-4"
    >
      {{ t("auth.login.signedOutPartially") }}
    </InfoNote>

    <div
      v-if="noAccess"
      class="flex flex-col items-center gap-5"
    >
      <InfoNote
        tone="warn"
        announce
      >
        {{ t("auth.login.noAccess") }}
      </InfoNote>
      <BaseButton
        data-track="auth.login.useOtherAccount"
        variant="primary"
        :disabled="busy"
        @click="useOtherAccount"
      >
        {{ t("auth.login.useOtherAccount") }}
      </BaseButton>
    </div>
    <ClerkPanel v-else>
      <SignIn
        routing="path"
        path="/login"
        sign-up-url="/registrieren"
        :fallback-redirect-url="target"
      />
    </ClerkPanel>
  </BrandLayout>
</template>
