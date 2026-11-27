<script setup lang="ts">
/** Profile & account: head, one tab per area with its own URL, the tab below. */
import { computed } from "vue";
import { useRoute } from "vue-router";

import PageHeader from "@/components/page/PageHeader.vue";
import TabNav, { type TabItem } from "@/components/page/TabNav.vue";
import { useAppI18n } from "@/core/i18n";

const { t } = useAppI18n();
const route = useRoute();

const tabs = computed<TabItem[]>(() => [
  { id: "profile", label: t("users.account.profileTab"), icon: "nav-benutzer", to: { name: "account-profile" } },
  { id: "security", label: t("users.account.securityTab"), icon: "ui-key", to: { name: "account-security" } },
  { id: "appearance", label: t("users.account.appearanceTab"), icon: "ui-text-size", to: { name: "account-appearance" } },
]);
const subtitle = computed(() => {
  if (route.name === "account-security") return t("users.account.securitySubtitle");
  if (route.name === "account-appearance") return t("users.account.appearanceSubtitle");
  return t("users.account.profileSubtitle");
});
const current = computed(() => {
  if (route.name === "account-security") return t("users.account.securityTab");
  if (route.name === "account-appearance") return t("users.account.appearanceTab");
  return t("users.account.profileTab");
});
</script>

<template>
  <PageHeader
    :title="t('users.account.title')"
    icon="nav-benutzer"
    :subtitle="subtitle"
    :breadcrumb="[{ label: t('users.account.breadcrumb'), to: '/dashboard' }, { label: current }]"
  />
  <TabNav
    :tabs="tabs"
    :label="t('users.account.tabs')"
  />
  <RouterView />
</template>
