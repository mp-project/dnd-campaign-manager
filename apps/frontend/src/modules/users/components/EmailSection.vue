<script setup lang="ts">
/**
 * Changing the email: the new address gets a code (and a link); until it is confirmed the old one
 * stays in use and the profile shows the pending one. Accounts with a password confirm with it.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import CodeInput from "@/components/base/CodeInput.vue";
import FormField from "@/components/base/FormField.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import TextInput from "@/components/base/TextInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import { errorMessageKey, isApiError } from "@/core/api/errors";
import { isEmail } from "@/core/auth/accountRules";
import { type Me, meQuery } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";

import { confirmEmailChange, requestEmailChange } from "../api";

const props = defineProps<{ me: Me }>();
const { t } = useAppI18n();
const queryClient = useQueryClient();

const email = ref("");
const password = ref("");
const digits = ref(["", "", "", "", "", ""]);
const errors = ref({ email: "", password: "", code: "" });
const notice = ref<{ tone: "ok" | "danger"; text: string } | null>(null);
const busy = ref(false);
const code = computed(() => digits.value.join(""));

async function reload(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
}

async function request(): Promise<void> {
  notice.value = null;
  const address = email.value.trim();
  errors.value = {
    email: isEmail(address)
      ? address.toLowerCase() === props.me.email.toLowerCase()
        ? t("users.email.same")
        : ""
      : t("auth.validation.email"),
    password: props.me.signIn.password && !password.value ? t("auth.validation.passwordRequired") : "",
    code: "",
  };
  if (errors.value.email || errors.value.password) return;

  busy.value = true;
  try {
    const result = await requestEmailChange({
      email: address,
      ...(props.me.signIn.password ? { currentPassword: password.value } : {}),
    });
    notice.value = { tone: "ok", text: t("users.email.requested", { email: result.pendingEmail }) };
    email.value = "";
    password.value = "";
    await reload();
  } catch (error) {
    notice.value = { tone: "danger", text: t(errorMessageKey(error)) };
  } finally {
    busy.value = false;
  }
}

async function confirm(): Promise<void> {
  notice.value = null;
  errors.value = { ...errors.value, code: /^\d{6}$/.test(code.value) ? "" : t("auth.validation.code") };
  if (errors.value.code) return;

  busy.value = true;
  try {
    const profile = await confirmEmailChange({ verificationCode: code.value });
    notice.value = { tone: "ok", text: t("users.email.confirmed", { email: profile.email }) };
    digits.value = ["", "", "", "", "", ""];
    await reload();
  } catch (error) {
    notice.value = {
      tone: "danger",
      text: isApiError(error) && error.status === 409 ? t("users.email.codeInvalid") : t(errorMessageKey(error)),
    };
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SectionCard
    id="email"
    :title="t('users.email.title')"
    icon="ui-mail"
  >
    <p class="meta">
      {{ t("users.email.current") }}
    </p>
    <p class="mb-4 font-semibold break-all text-heading">
      {{ me.email }}
    </p>

    <form
      v-if="me.pendingEmail"
      class="mb-5 flex flex-col gap-3 border-b border-line pb-5"
      novalidate
      @submit.prevent="confirm"
    >
      <InfoNote tone="warn">
        {{ t("users.email.pending", { email: me.pendingEmail }) }}
      </InfoNote>
      <fieldset>
        <legend class="label mb-2">
          {{ t("users.email.code") }}
        </legend>
        <CodeInput
          v-model="digits"
          :invalid="!!errors.code"
        />
        <p
          v-if="errors.code"
          class="mt-2 text-[14px] text-danger"
        >
          {{ errors.code }}
        </p>
      </fieldset>
      <BaseButton
        variant="primary"
        type="submit"
        :disabled="busy"
      >
        {{ t("users.email.confirm") }}
      </BaseButton>
    </form>

    <form
      class="flex flex-col gap-3"
      novalidate
      @submit.prevent="request"
    >
      <FormField
        v-slot="field"
        :label="t('users.email.newEmail')"
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
      <FormField
        v-if="me.signIn.password"
        v-slot="field"
        :label="t('users.email.currentPassword')"
        :error="errors.password"
      >
        <PasswordInput
          :id="field.id"
          v-model="password"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <BaseButton
        type="submit"
        :disabled="busy"
      >
        {{ t("users.email.request") }}
      </BaseButton>
    </form>

    <InfoNote
      v-if="notice"
      class="mt-3"
      :tone="notice.tone"
      announce
    >
      {{ notice.text }}
    </InfoNote>
  </SectionCard>
</template>
