<script setup lang="ts">
/** Sign-in & security: email, password, sign-in methods, trusted devices and sessions. */
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey } from "@/core/api/errors";
import { useMe } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";

import EmailSection from "../components/EmailSection.vue";
import PasswordSection from "../components/PasswordSection.vue";
import SessionsSection from "../components/SessionsSection.vue";
import SignInMethods from "../components/SignInMethods.vue";
import TrustedDevicesSection from "../components/TrustedDevicesSection.vue";

const { t } = useAppI18n();
const me = useMe();
</script>

<template>
  <div
    v-if="me.data.value"
    class="grid gap-4 md:grid-cols-2 md:gap-5"
  >
    <EmailSection :me="me.data.value" />
    <PasswordSection :me="me.data.value" />
    <SignInMethods :me="me.data.value" />
    <TrustedDevicesSection />
    <SessionsSection class="md:col-span-2" />
  </div>
  <p
    v-else-if="me.isPending.value"
    class="text-ink-2"
  >
    {{ t("common.states.loading") }}
  </p>
  <InfoNote
    v-else
    tone="danger"
  >
    {{ t(errorMessageKey(me.error.value)) }}
  </InfoNote>
</template>
