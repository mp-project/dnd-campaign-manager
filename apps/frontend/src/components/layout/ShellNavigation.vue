<script setup lang="ts">
/**
 * The navigation of the shells, shared by the sidebar and the mobile menu. The campaign card shows
 * where the campaign's entries lead and switches campaigns, where the top bar doesn't (player view,
 * account pages, mobile menu).
 */
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import { useAppI18n } from "@/core/i18n";
import { type NavEntry, type NavGroupId, useNavigation } from "@/core/navigation/navigation";

import NavTree from "./NavTree.vue";
import SidebarCampaign from "./SidebarCampaign.vue";

const props = defineProps<{
  compact?: boolean;
  /** Always show the campaign card (mobile menu: there is no top bar with the switcher). */
  campaignCard?: boolean;
}>();
const emit = defineEmits<{ navigate: [] }>();

const { t } = useAppI18n();
const route = useRoute();
const nav = useNavigation();
const tree = ref<InstanceType<typeof NavTree>>();

const campaignEntries = computed<NavEntry[]>(() =>
  nav.campaignMode.value === "player"
    ? nav.playerLinks.value.map((link) => ({ kind: "link", link }))
    : nav.campaignEntries.value,
);
const showCard = computed(
  () => props.campaignCard || nav.campaignMode.value === "player" || route.meta.area !== "campaign",
);

defineExpose({ openGroups: (groups: NavGroupId[]) => tree.value?.openGroups(groups) });
</script>

<template>
  <NavTree
    ref="tree"
    :account="nav.account.value"
    :campaign="campaignEntries"
    :active-id="nav.activeId.value"
    :active-group="nav.activeGroup.value"
    :compact="compact"
    @navigate="emit('navigate')"
  >
    <template
      v-if="showCard"
      #campaign
    >
      <SidebarCampaign
        :campaign="nav.campaign.value"
        :compact="compact"
        @navigate="emit('navigate')"
      />
    </template>
    <template #campaign-empty>
      <p
        v-if="!compact && !nav.campaign.value"
        class="px-6 py-2 text-[0.84375rem] leading-snug text-parchment/70"
      >
        {{ t("common.shell.noCampaign") }}
      </p>
    </template>
  </NavTree>
</template>
