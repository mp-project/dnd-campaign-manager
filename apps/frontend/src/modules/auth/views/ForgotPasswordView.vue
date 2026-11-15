<script setup lang="ts">
/**
 * Requests the link for a new password, in the active language. The answer is the same whether an
 * account exists or not.
 */
import { ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { forgotPassword } from "../api";
import { useAuthErrorText } from "../errors";
import { browserSettings, emailFromHistory, isEmail } from "../form";

const { t, locale } = useAppI18n();
const errorText = useAuthErrorText();

const email = ref(emailFromHistory());
const emailError = ref("");
const failure = ref("");
const sent = ref(false);
const busy = ref(false);

async function submit(): Promise<void> {
  failure.value = "";
  sent.value = false;
  emailError.value = isEmail(email.value) ? "" : t("auth.validation.email");
  if (emailError.value) return;

  busy.value = true;
  try {
    await forgotPassword({ email: email.value.trim(), locale: browserSettings(locale.value).locale });
    sent.value = true;
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BrandLayout
    :title="t('auth.forgot.title')"
    :subtitle="t('auth.forgot.subtitle')"
    size="narrow"
  >
    <form
      class="flex flex-col gap-5"
      novalidate
      @submit.prevent="submit"
    >
      <FormField
        v-slot="field"
        :label="t('auth.fields.email')"
        :error="emailError"
      >
        <TextInput
          :id="field.id"
          v-model="email"
          type="email"
          icon="ui-mail"
          autocomplete="email"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>

      <InfoNote
        v-if="sent"
        tone="ok"
        announce
      >
        {{ t("auth.forgot.sent") }}
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
        {{ t("auth.forgot.submit") }}
      </BaseButton>
    </form>

    <template #footer>
      <RouterLink
        :to="{ name: 'auth-login' }"
        class="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4"
      >
        {{ t("auth.forgot.back") }}
      </RouterLink>
    </template>
  </BrandLayout>
</template>
