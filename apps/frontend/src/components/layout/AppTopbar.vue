<script setup lang="ts">
/**
 * Desktop top bar (76 px). In a campaign: switcher, ruleset, role; on account pages the area.
 * Search and notifications come with their modules.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";

import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import Icon from "@/components/base/Icon.vue";
import { campaignHomePath, roleMessageKey, useMyCampaigns, useRuleset } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useNavigation } from "@/core/navigation/navigation";

import UserMenu from "./UserMenu.vue";

const { t } = useAppI18n();
const nav = useNavigation();
const route = useRoute();
const campaigns = useMyCampaigns();
const campaign = nav.campaign;
const inCampaign = computed(() => route.meta.area === "campaign");
const ruleset = useRuleset(() => campaign.value?.rulesetId);

const campaignItems = computed<DropdownItem[]>(() => [
  { heading: t("common.shell.switchCampaign") },
  ...(campaigns.data.value?.data ?? []).map((entry) => ({
    label: entry.name,
    icon: "nav-kampagne" as const,
    to: campaignHomePath(entry),
    active: entry.id === campaign.value?.id,
  })),
  { divider: true },
  { label: t("common.shell.allCampaigns"), icon: "nav-dashboard", to: "/dashboard" },
]);
</script>

<template>
  <header class="hidden h-19 shrink-0 items-center gap-3 border-b border-navy-line bg-navy-900 px-5 text-parchment md:flex">
    <template v-if="campaign && inCampaign">
      <DropdownMenu
        :items="campaignItems"
        align="left"
        dark
      >
        <template #trigger="{ toggle, open }">
          <button
            type="button"
            class="shell-chip min-w-60"
            :aria-expanded="open"
            :aria-label="`${campaign.name} – ${t('common.shell.switchCampaign')}`"
            @click="toggle"
          >
            <Icon
              name="nav-kampagne"
              :size="22"
              class="text-gold-light"
            /><span class="truncate">{{ campaign.name }}</span><Icon
              name="ui-chevron-down"
              :size="18"
              class="ml-auto"
            />
          </button>
        </template>
      </DropdownMenu>
      <span
        v-if="ruleset.data.value"
        class="shell-chip"
        :title="t('common.shell.ruleset')"
      ><Icon
        name="orig-wuerfel"
        :size="22"
        class="text-gold-light"
      />{{ ruleset.data.value.name }}</span>
      <span
        v-if="campaign.role"
        class="shell-chip"
        :title="t('common.shell.role')"
      ><Icon
        name="orig-krone"
        :size="22"
        class="text-gold-light"
      />{{ t(roleMessageKey(campaign.role)) }}</span>
    </template>
    <span
      v-else
      class="shell-chip"
    ><Icon
      name="nav-dashboard"
      :size="22"
      class="text-gold-light"
    />{{ t("common.nav.account") }}</span>

    <div class="ml-auto">
      <UserMenu :switch-to="nav.viewSwitch.value" />
    </div>
  </header>
</template>
