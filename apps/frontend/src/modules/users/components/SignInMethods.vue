<script setup lang="ts">
/** How the account signs in: password and the providers; read-only (providers are never linked later). */
import { computed } from "vue";

import Badge from "@/components/base/Badge.vue";
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import SectionCard from "@/components/page/SectionCard.vue";
import type { Me } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";

const props = defineProps<{ me: Me }>();
const { t } = useAppI18n();

const methods = computed<Array<{ id: string; label: string; icon: IconName; connected: boolean }>>(() => [
  { id: "password", label: t("users.methods.password"), icon: "ui-key", connected: props.me.signIn.password },
  { id: "google", label: "Google", icon: "ui-google", connected: props.me.signIn.providers.includes("GOOGLE") },
  { id: "discord", label: "Discord", icon: "ui-discord", connected: props.me.signIn.providers.includes("DISCORD") },
]);
</script>

<template>
  <SectionCard
    :title="t('users.methods.title')"
    icon="ui-link"
  >
    <ul class="flex flex-col gap-2">
      <li
        v-for="method in methods"
        :key="method.id"
        class="flex items-center gap-3 rounded-card border border-line bg-parchment-card p-3"
      >
        <Icon
          :name="method.icon"
          :size="24"
          class="shrink-0"
        />
        <span class="min-w-0 flex-1 font-semibold text-heading">{{ method.label }}</span>
        <Badge
          :tone="method.connected ? 'ok' : 'neutral'"
          :icon="method.connected ? 'ui-check' : undefined"
        >
          {{ method.connected ? t("users.methods.connected") : t("users.methods.notConnected") }}
        </Badge>
      </li>
    </ul>
    <p class="meta mt-3">
      {{ t("users.methods.hint") }}
    </p>
  </SectionCard>
</template>
