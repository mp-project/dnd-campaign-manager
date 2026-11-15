<script setup lang="ts">
/**
 * Confirms the email with the 6-digit code from the registration mail. The email comes from the
 * previous page (history state) or is typed in; confirming doesn't sign in, the sign-in follows
 * with the address filled in. Sending a new code never says whether a registration waits.
 */
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import CodeInput from "@/components/base/CodeInput.vue";
import FormField from "@/components/base/FormField.vue";
import Icon from "@/components/base/Icon.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { isApiError } from "@/core/api/errors";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";
import { isEmail } from "@/core/auth/accountRules";

import { requestVerification, verifyEmail } from "../api";
import { useAuthErrorText } from "../errors";
import { emailFromHistory } from "../form";
import { useAuthRedirect } from "../redirect";

const { t } = useAppI18n();
const errorText = useAuthErrorText();
const router = useRouter();

const { passOn } = useAuthRedirect();

const email = ref(emailFromHistory());
const digits = ref(["", "", "", "", "", ""]);
const errors = reactive({ email: "", code: "" });
const failure = ref("");
const resent = ref(false);
const busy = ref(false);

const code = computed(() => digits.value.join(""));
const complete = computed(() => /^\d{6}$/.test(code.value));

function checkEmail(): boolean {
  errors.email = isEmail(email.value) ? "" : t("auth.validation.email");
  return !errors.email;
}

async function submit(): Promise<void> {
  failure.value = "";
  resent.value = false;
  const emailOk = checkEmail();
  errors.code = complete.value ? "" : t("auth.validation.code");
  if (!emailOk || errors.code) return;

  busy.value = true;
  try {
    const address = email.value.trim();
    await verifyEmail({ email: address, verificationCode: code.value });
    await router.replace({
      name: "auth-login",
      query: { verified: "1", ...passOn.value },
      state: { email: address },
    });
  } catch (error) {
    // Every failure of the code (wrong, expired, used up, unknown address) is the same 409.
    failure.value = isApiError(error) && error.status === 409 ? t("auth.errors.codeInvalid") : errorText(error);
  } finally {
    busy.value = false;
  }
}

async function resend(): Promise<void> {
  failure.value = "";
  resent.value = false;
  if (!checkEmail()) return;

  busy.value = true;
  try {
    await requestVerification({ email: email.value.trim() });
    resent.value = true;
    digits.value = ["", "", "", "", "", ""];
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BrandLayout
    :title="t('auth.activate.title')"
    :subtitle="t('auth.activate.subtitle')"
    size="narrow"
  >
    <template #switch>
      {{ t("auth.shell.haveAccount") }}
      <RouterLink
        :to="{ name: 'auth-login', query: passOn }"
        class="font-medium text-gold-light underline underline-offset-4"
      >
        {{ t("auth.shell.toLogin") }}
      </RouterLink>
    </template>

    <form
      class="flex flex-col gap-5"
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
          v-model="email"
          type="email"
          icon="ui-mail"
          autocomplete="email"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <fieldset>
        <legend class="label mb-2">
          {{ t("auth.activate.code") }}
        </legend>
        <CodeInput
          v-model="digits"
          :invalid="!!errors.code"
        />
        <p
          v-if="errors.code && !complete"
          class="mt-2 flex items-center gap-1.5 text-[14px] text-danger"
        >
          <Icon
            name="ui-alert"
            :size="16"
          />{{ errors.code }}
        </p>
      </fieldset>

      <InfoNote
        v-if="failure"
        tone="danger"
        announce
      >
        {{ failure }}
      </InfoNote>
      <InfoNote
        v-if="resent"
        tone="ok"
        announce
      >
        {{ t("auth.activate.resent") }}
      </InfoNote>

      <BaseButton
        variant="primary"
        type="submit"
        block
        :disabled="busy"
      >
        {{ t("auth.activate.submit") }}
      </BaseButton>
    </form>

    <template #footer>
      {{ t("auth.activate.noCode") }}<br>
      <button
        type="button"
        class="min-h-11 font-medium text-brand underline underline-offset-4"
        :disabled="busy"
        @click="resend"
      >
        {{ t("auth.activate.resend") }}
      </button>
    </template>
  </BrandLayout>
</template>
