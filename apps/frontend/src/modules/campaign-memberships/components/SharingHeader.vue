<script setup lang="ts">
/**
 * Head of the campaign's sharing page ("Freigaben"): title, breadcrumb, the one primary action
 * "Spieler einladen" (game master only, like the API) and the tabs with their own address:
 * members (this module) and invitations (`campaign-invitations`, game master only). The counts
 * appear once known.
 */
import { computed } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import PageHeader from "@/components/page/PageHeader.vue";
import TabNav, { type TabItem } from "@/components/page/TabNav.vue";
import { useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useCan } from "@/core/permissions/useCan";

const props = defineProps<{ members?: number | null; invitations?: number | null }>();

const { t } = useAppI18n();
const { can } = useCan();
const { campaign, segment } = useCurrentCampaign();

const at = (name: string) => ({ name, params: { campaign: segment.value ?? "" } });
const canInvite = computed(() => can("campaignInvitations.create"));

// i18n-dynamic: campaign-memberships.tabs.*
const label = (key: "members" | "invitations", count: number | null | undefined) =>
  count == null ? t(`campaign-memberships.tabs.${key}`) : t(`campaign-memberships.tabs.${key}Count`, { count });

const tabs = computed<TabItem[]>(() => [
  { id: "members", label: label("members", props.members), icon: "ui-users", to: at("campaign-sharing") },
  ...(can("campaignInvitations.read")
    ? [{ id: "invitations", label: label("invitations", props.invitations), icon: "ui-mail" as const, to: at("campaign-invitations") }]
    : []),
]);
const breadcrumb = computed(() => [
  { label: campaign.value?.name ?? "", mobileLabel: t("campaign-memberships.breadcrumbCampaign"), to: at("campaign-overview") },
  { label: t("campaign-memberships.title") },
]);
</script>

<template>
  <PageHeader
    :title="t('campaign-memberships.title')"
    icon="nav-freigaben"
    :subtitle="t('campaign-memberships.subtitle')"
    :mobile-subtitle="t('campaign-memberships.mobileSubtitle')"
    :breadcrumb="breadcrumb"
  >
    <template
      v-if="canInvite"
      #actions
    >
      <BaseButton
        variant="primary"
        icon="ui-mail"
        :to="at('campaign-invitation-new')"
      >
        {{ t("campaign-memberships.invite") }}
      </BaseButton>
    </template>
    <template
      v-if="canInvite"
      #mobile-actions
    >
      <BaseButton
        variant="primary"
        icon="ui-mail"
        :to="at('campaign-invitation-new')"
      >
        {{ t("campaign-memberships.inviteShort") }}
      </BaseButton>
    </template>
  </PageHeader>
  <TabNav
    :tabs="tabs"
    :label="t('campaign-memberships.tabsLabel')"
    class="mb-4"
  />
</template>
