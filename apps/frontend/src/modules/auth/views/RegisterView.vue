<script setup lang="ts">
/**
 * Registration: display name, optional username, email and password. The backend always answers
 * the same (a taken address gets an info mail instead of a code), so the confirmation page follows
 * in every case; the email goes along in the history state, not in the URL.
 */
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import CheckBox from "@/components/base/CheckBox.vue";
import FormField from "@/components/base/FormField.vue";
import Icon from "@/components/base/Icon.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { useAppI18n } from "@/core/i18n";
import BrandLayout from "@/layouts/BrandLayout.vue";

import { register } from "../api";
import OAuthButtons from "../components/OAuthButtons.vue";
import RotatingQuote from "../components/RotatingQuote.vue";
import { useAuthErrorText } from "../errors";
import {
  browserSettings,
  isDisplayName,
  isEmail,
  isPassword,
  isUsername,
  optionalUsername,
  PASSWORD_MIN_LENGTH,
} from "../form";
import { useAuthRedirect } from "../redirect";

const { t, locale } = useAppI18n();
const errorText = useAuthErrorText();
const router = useRouter();

const { target, passOn } = useAuthRedirect();

const form = reactive({ displayName: "", username: "", email: "", password: "", passwordRepeat: "", privacy: false });
const errors = reactive({ displayName: "", username: "", email: "", password: "", passwordRepeat: "", privacy: "" });
const failure = ref("");
const busy = ref(false);

function validate(): boolean {
  errors.displayName = isDisplayName(form.displayName) ? "" : t("auth.validation.displayName");
  errors.username = isUsername(form.username) ? "" : t("auth.validation.username");
  errors.email = isEmail(form.email) ? "" : t("auth.validation.email");
  errors.password = isPassword(form.password) ? "" : t("auth.validation.passwordLength", { min: PASSWORD_MIN_LENGTH });
  errors.passwordRepeat = form.passwordRepeat === form.password ? "" : t("auth.validation.passwordRepeat");
  errors.privacy = form.privacy ? "" : t("auth.validation.privacy");
  return Object.values(errors).every((error) => !error);
}

async function submit(): Promise<void> {
  failure.value = "";
  if (!validate()) return;

  busy.value = true;
  try {
    const email = form.email.trim();
    await register({
      email,
      displayName: form.displayName.trim(),
      password: form.password,
      privacyAccepted: true,
      ...optionalUsername(form.username),
      ...browserSettings(locale.value),
    });
    await router.push({
      name: "auth-activate",
      query: passOn.value,
      state: { email },
    });
  } catch (error) {
    failure.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BrandLayout
    :title="t('auth.register.title')"
    :subtitle="t('auth.register.subtitle')"
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

    <RotatingQuote />

    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="submit"
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
      <FormField
        v-slot="field"
        :label="t('auth.fields.email')"
        :error="errors.email"
        required
      >
        <TextInput
          :id="field.id"
          v-model="form.email"
          type="email"
          icon="ui-mail"
          autocomplete="email"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-slot="field"
        :label="t('auth.fields.password')"
        :hint="t('auth.fields.passwordHint', { min: PASSWORD_MIN_LENGTH })"
        :error="errors.password"
        required
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
        required
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
        {{ t("auth.register.submit") }}
      </BaseButton>
      <p class="text-center">
        {{ t("auth.shell.haveAccount") }}
        <RouterLink
          :to="{ name: 'auth-login', query: passOn }"
          class="inline-flex min-h-11 items-center text-info underline underline-offset-4"
        >
          {{ t("auth.shell.toLogin") }}
        </RouterLink>
      </p>
    </form>

    <OAuthButtons
      intent="register"
      :redirect="target"
    />
  </BrandLayout>
</template>
