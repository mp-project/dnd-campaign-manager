<script setup lang="ts">
/**
 * Back from the provider (the API redirects here): `?status=success|registration_required|error`,
 * `redirect` and on errors `code`.
 * - success: signed in, on to the target page;
 * - registration_required: the provider confirmed the account, but there is none here yet; the
 *   completion form creates it (the API keeps the provider's data in a signed cookie);
 * - error: the code's text and the way back to the sign-in.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import CheckBox from "@/components/base/CheckBox.vue";
import FormField from "@/components/base/FormField.vue";
import Icon from "@/components/base/Icon.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { API_ERROR_CODES } from "@/core/api/errors";
import { clearSessionCache } from "@/core/api/queryClient";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { completeOAuthRegistration } from "../api";
import { useAuthErrorText } from "../errors";
import { browserSettings, isDisplayName, isUsername, optionalUsername } from "../form";
import { useAuthRedirect } from "../redirect";

const { t, locale } = useAppI18n();
const errorText = useAuthErrorText();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();

const status = computed(() => {
  const value = route.query.status;
  return value === "success" || value === "registration_required" ? value : "error";
});
const { target, passOn } = useAuthRedirect();

/** Only codes the app knows; anything else is the general provider failure. */
const errorKey = computed(() => {
  const code = route.query.code;
  const known = typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code);
  // i18n-dynamic: errors.*
  return known ? (`errors.${code}` as `errors.${(typeof API_ERROR_CODES)[number]}`) : "errors.OAUTH_CALLBACK_FAILED";
});

const form = reactive({ displayName: "", username: "", privacy: false });
const errors = reactive({ displayName: "", username: "", privacy: "" });
const failure = ref("");
const busy = ref(false);

async function signedIn(): Promise<void> {
  // Nothing of a previous account may remain; the guards load the new profile.
  clearSessionCache(queryClient);
  await router.replace(target.value);
}

onMounted(() => {
  if (status.value === "success") void signedIn();
});

async function complete(): Promise<void> {
  failure.value = "";
  errors.displayName = isDisplayName(form.displayName) ? "" : t("auth.validation.displayName");
  errors.username = isUsername(form.username) ? "" : t("auth.validation.username");
  errors.privacy = form.privacy ? "" : t("auth.validation.privacy");
  if (errors.displayName || errors.username || errors.privacy) return;

  busy.value = true;
  try {
    await completeOAuthRegistration({
      displayName: form.displayName.trim(),
      privacyAccepted: true,
      ...optionalUsername(form.username),
      ...browserSettings(locale.value),
    });
    await signedIn();
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BrandLayout
    v-if="status === 'success'"
    :title="t('auth.login.title')"
    size="narrow"
  >
    <p
      class="text-center text-ink-2"
      role="status"
    >
      {{ t("auth.oauth.signingIn") }}
    </p>
  </BrandLayout>

  <BrandLayout
    v-else-if="status === 'registration_required'"
    :title="t('auth.oauth.completeTitle')"
    :subtitle="t('auth.oauth.completeSubtitle')"
  >
    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="complete"
    >
      <FormField
        v-slot="field"
        :label="t('auth.fields.displayName')"
        :hint="t('auth.fields.displayNameHint')"
        :error="errors.displayName"
        required
      >
        <TextInput
          :id="field.id"
          v-model="form.displayName"
          icon="ui-user"
          autocomplete="nickname"
          maxlength="120"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-slot="field"
        :label="t('auth.fields.username')"
        :hint="t('auth.fields.usernameHint')"
        :error="errors.username"
      >
        <TextInput
          :id="field.id"
          v-model="form.username"
          icon="ui-user"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          maxlength="24"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <div>
        <CheckBox
          v-model="form.privacy"
          :label="t('auth.fields.privacy')"
        />
        <!-- New tab, so the filled-in form stays. -->
        <RouterLink
          :to="{ name: 'legal-privacy' }"
          target="_blank"
          class="ml-8 inline-flex min-h-11 items-center text-info underline underline-offset-4"
        >
          {{ t("common.legal.readPrivacy") }}
        </RouterLink>
        <p
          v-if="errors.privacy"
          class="flex items-center gap-1.5 text-[14px] text-danger"
        >
          <Icon
            name="ui-alert"
            :size="16"
          />{{ errors.privacy }}
        </p>
      </div>

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
        {{ t("auth.oauth.completeSubmit") }}
      </BaseButton>
    </form>

    <template #footer>
      <RouterLink
        :to="{ name: 'auth-login' }"
        class="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
      >
        {{ t("auth.oauth.back") }}
      </RouterLink>
    </template>
  </BrandLayout>

  <BrandLayout
    v-else
    :title="t('auth.oauth.errorTitle')"
    size="narrow"
  >
    <InfoNote tone="danger">
      {{ t(errorKey) }}
    </InfoNote>
    <template #footer>
      <RouterLink
        :to="{ name: 'auth-login', query: passOn }"
        class="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
      >
        {{ t("auth.oauth.back") }}
      </RouterLink>
    </template>
  </BrandLayout>
</template>
