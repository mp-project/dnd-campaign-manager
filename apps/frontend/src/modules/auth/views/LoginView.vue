<script setup lang="ts">
/**
 * Sign-in with email and password, or through a provider. Notes from the links that lead here:
 * `?verified=1|0` (registration link), `?reset=1` (password reset), `?signedOut=partial` (signing
 * out everywhere failed, only this browser is signed out). Afterwards the page from
 * `?redirect=` follows (only paths of this app), else the dashboard.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { isApiError } from "@/core/api/errors";
import { clearSessionCache } from "@/core/api/queryClient";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { login } from "../api";
import OAuthButtons from "../components/OAuthButtons.vue";
import RotatingQuote from "../components/RotatingQuote.vue";
import { useAuthErrorText } from "../errors";
import { emailFromHistory, isEmail } from "../form";
import { useAuthRedirect } from "../redirect";

const { t } = useAppI18n();
const errorText = useAuthErrorText();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();

const { target, passOn } = useAuthRedirect();
const notice = computed(() => {
  if (route.query.verified === "1") return "verified";
  if (route.query.verified === "0") return "verifyFailed";
  if (route.query.reset === "1") return "reset";
  if (route.query.signedOut === "partial") return "signedOutPartially";
  return null;
});

const form = reactive({ email: emailFromHistory(), password: "" });
const errors = reactive({ email: "", password: "" });
const failure = ref("");
const notVerified = ref(false);
const busy = ref(false);

async function submit(): Promise<void> {
  errors.email = isEmail(form.email) ? "" : t("auth.validation.email");
  errors.password = form.password ? "" : t("auth.validation.passwordRequired");
  failure.value = "";
  notVerified.value = false;
  if (errors.email || errors.password) return;

  busy.value = true;
  try {
    await login({ email: form.email.trim(), password: form.password });
    // Nothing of a previous account may remain; the guards load the new profile.
    clearSessionCache(queryClient);
    await router.replace(target.value);
  } catch (error) {
    if (isApiError(error) && error.code === "EMAIL_NOT_VERIFIED") notVerified.value = true;
    else failure.value = errorText(error);
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
    <template #switch>
      {{ t("auth.shell.noAccount") }}
      <RouterLink
        :to="{ name: 'auth-register', query: passOn }"
        class="font-medium text-gold-light underline underline-offset-4"
      >
        {{ t("auth.shell.toRegister") }}
      </RouterLink>
    </template>

    <RotatingQuote />

    <div
      v-if="notice"
      class="mb-4"
    >
      <InfoNote
        v-if="notice === 'verified'"
        tone="ok"
      >
        {{ t("auth.login.verified") }}
      </InfoNote>
      <InfoNote
        v-else-if="notice === 'reset'"
        tone="ok"
      >
        {{ t("auth.login.reset") }}
      </InfoNote>
      <InfoNote
        v-else-if="notice === 'signedOutPartially'"
        tone="danger"
      >
        {{ t("auth.login.signedOutPartially") }}
      </InfoNote>
      <InfoNote
        v-else
        tone="warn"
      >
        {{ t("auth.login.verifyFailed") }}
        <RouterLink
          :to="{ name: 'auth-activate' }"
          class="font-medium underline underline-offset-4"
        >
          {{ t("auth.login.verifyWithCode") }}
        </RouterLink>
      </InfoNote>
    </div>

    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="submit"
    >
      <FormField
        v-slot="field"
        :label="t('auth.fields.email')"
        :error="errors.email"
      >
        <TextInput
          :id="field.id"
          v-model="form.email"
          type="email"
          icon="ui-mail"
          autocomplete="username"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-slot="field"
        :label="t('auth.fields.password')"
        :error="errors.password"
      >
        <PasswordInput
          :id="field.id"
          v-model="form.password"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>

      <InfoNote
        v-if="notVerified"
        tone="warn"
        announce
      >
        {{ t("auth.login.notVerified") }}
        <RouterLink
          :to="{ name: 'auth-activate', query: passOn, state: { email: form.email.trim() } }"
          class="font-medium underline underline-offset-4"
        >
          {{ t("auth.login.toActivation") }}
        </RouterLink>
      </InfoNote>
      <InfoNote
        v-if="failure"
        tone="danger"
        announce
      >
        {{ failure }}
      </InfoNote>

      <BaseButton
        variant="primary"
        type="submit"
        block
        :disabled="busy"
      >
        {{ t("auth.login.submit") }}
      </BaseButton>
      <div class="flex flex-wrap items-center justify-between gap-x-4">
        <RouterLink
          :to="{ name: 'auth-register', query: passOn }"
          class="inline-flex min-h-11 items-center text-info underline underline-offset-4"
        >
          {{ t("auth.login.toRegister") }}
        </RouterLink>
        <RouterLink
          :to="{ name: 'auth-forgot-password' }"
          class="inline-flex min-h-11 items-center text-info underline underline-offset-4"
        >
          {{ t("auth.login.forgot") }}
        </RouterLink>
      </div>
    </form>

    <OAuthButtons
      intent="login"
      :redirect="target"
    />
  </BrandLayout>
</template>
