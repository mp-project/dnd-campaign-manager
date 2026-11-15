<script setup lang="ts">
/**
 * Sets a new password with the token from the emailed link (`?token=`). Every session of the
 * account ends; the sign-in follows. Trusting the device is left to the account settings.
 */
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { isApiError } from "@/core/api/errors";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { resetPassword } from "../api";
import { useAuthErrorText } from "../errors";
import { isPassword, PASSWORD_MIN_LENGTH } from "../form";

const { t } = useAppI18n();
const errorText = useAuthErrorText();
const route = useRoute();
const router = useRouter();

const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));

const form = reactive({ password: "", passwordRepeat: "" });
const errors = reactive({ password: "", passwordRepeat: "" });
const failure = ref("");
const linkUnusable = ref(false);
const busy = ref(false);

const RESET_LINK_ERRORS = new Set(["PASSWORD_RESET_INVALID", "PASSWORD_RESET_EXPIRED", "PASSWORD_RESET_USED"]);

async function submit(): Promise<void> {
  failure.value = "";
  linkUnusable.value = false;
  errors.password = isPassword(form.password) ? "" : t("auth.validation.passwordLength", { min: PASSWORD_MIN_LENGTH });
  errors.passwordRepeat = form.passwordRepeat === form.password ? "" : t("auth.validation.passwordRepeat");
  if (errors.password || errors.passwordRepeat) return;

  busy.value = true;
  try {
    await resetPassword({ token: token.value, newPassword: form.password });
    await router.replace({ name: "auth-login", query: { reset: "1" } });
  } catch (error) {
    failure.value = errorText(error);
    linkUnusable.value = isApiError(error) && RESET_LINK_ERRORS.has(error.code);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BrandLayout
    :title="t('auth.reset.title')"
    :subtitle="t('auth.reset.subtitle')"
    size="narrow"
  >
    <InfoNote
      v-if="!token"
      tone="warn"
    >
      {{ t("auth.reset.missingToken") }}
    </InfoNote>

    <form
      v-else
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="submit"
    >
      <FormField
        v-slot="field"
        :label="t('auth.fields.newPassword')"
        :hint="t('auth.fields.passwordHint', { min: PASSWORD_MIN_LENGTH })"
        :error="errors.password"
      >
        <PasswordInput
          :id="field.id"
          v-model="form.password"
          autocomplete="new-password"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-slot="field"
        :label="t('auth.fields.passwordRepeat')"
        :error="errors.passwordRepeat"
      >
        <PasswordInput
          :id="field.id"
          v-model="form.passwordRepeat"
          autocomplete="new-password"
          :placeholder="t('auth.fields.passwordRepeat')"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>

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
        {{ t("auth.reset.submit") }}
      </BaseButton>
    </form>

    <template #footer>
      <RouterLink
        v-if="!token || linkUnusable"
        :to="{ name: 'auth-forgot-password' }"
        class="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
      >
        {{ t("auth.reset.requestNew") }}
      </RouterLink>
      <RouterLink
        v-else
        :to="{ name: 'auth-login' }"
        class="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
      >
        {{ t("auth.forgot.back") }}
      </RouterLink>
    </template>
  </BrandLayout>
</template>
