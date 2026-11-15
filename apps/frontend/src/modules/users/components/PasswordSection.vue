<script setup lang="ts">
/**
 * Changing the password ends every session, this one too, and removes the trusted devices; the
 * sign-in follows with a note. Accounts without a password (provider only) see why there is none.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import { errorMessageKey } from "@/core/api/errors";
import { clearSessionCache } from "@/core/api/queryClient";
import { isPassword, PASSWORD_MIN_LENGTH } from "@/core/auth/accountRules";
import type { Me } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";

import { changePassword } from "../api";

defineProps<{ me: Me }>();
const { t } = useAppI18n();
const router = useRouter();
const queryClient = useQueryClient();

const form = reactive({ current: "", next: "", repeat: "" });
const errors = reactive({ current: "", next: "", repeat: "" });
const failure = ref("");
const busy = ref(false);

async function submit(): Promise<void> {
  failure.value = "";
  errors.current = form.current ? "" : t("auth.validation.passwordRequired");
  errors.next = isPassword(form.next) ? "" : t("auth.validation.passwordLength", { min: PASSWORD_MIN_LENGTH });
  errors.repeat = form.repeat === form.next ? "" : t("auth.validation.passwordRepeat");
  if (errors.current || errors.next || errors.repeat) return;

  busy.value = true;
  try {
    await changePassword({ currentPassword: form.current, newPassword: form.next });
    clearSessionCache(queryClient);
    await router.push({ name: "auth-login", query: { passwordChanged: "1" } });
  } catch (error) {
    failure.value = t(errorMessageKey(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SectionCard
    :title="t('users.password.title')"
    icon="ui-key"
  >
    <InfoNote v-if="!me.signIn.password">
      {{ t("users.password.none") }}
    </InfoNote>
    <form
      v-else
      class="flex flex-col gap-3"
      novalidate
      @submit.prevent="submit"
    >
      <FormField
        v-slot="field"
        :label="t('users.password.current')"
        :error="errors.current"
      >
        <PasswordInput
          :id="field.id"
          v-model="form.current"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-slot="field"
        :label="t('users.password.new')"
        :hint="t('users.password.hint', { min: PASSWORD_MIN_LENGTH })"
        :error="errors.next"
      >
        <PasswordInput
          :id="field.id"
          v-model="form.next"
          autocomplete="new-password"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-slot="field"
        :label="t('users.password.repeat')"
        :error="errors.repeat"
      >
        <PasswordInput
          :id="field.id"
          v-model="form.repeat"
          autocomplete="new-password"
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
        :disabled="busy"
      >
        {{ t("users.password.submit") }}
      </BaseButton>
    </form>
  </SectionCard>
</template>
