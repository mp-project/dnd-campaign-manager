<script setup lang="ts">
/**
 * The campaign card in the navigation: which campaign the entries below belong to, and the switch
 * to the other campaigns of the account. Without a campaign it lists them right away.
 */
import { computed, ref } from "vue";

import Icon from "@/components/base/Icon.vue";
import {
  campaignHomePath,
  type Campaign,
  roleMessageKey,
  useMyCampaigns,
  useRuleset,
} from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useShellStore } from "@/core/ui/shell";

const props = defineProps<{ campaign: Campaign | null; compact?: boolean }>();
const emit = defineEmits<{ navigate: [] }>();

const { t } = useAppI18n();
const shell = useShellStore();
const campaigns = useMyCampaigns();
const ruleset = useRuleset(() => props.campaign?.rulesetId);
const choosing = ref(false);

const list = computed(() => campaigns.data.value?.data ?? []);
const subline = computed(() => {
  if (!props.campaign) return t("common.shell.campaignCount", list.value.length, { count: list.value.length });
  const role = props.campaign.role ? t(roleMessageKey(props.campaign.role)) : "";
  return [ruleset.data.value?.name, role].filter(Boolean).join(" · ");
});

function expand(): void {
  shell.setNavCollapsed(false);
  choosing.value = true;
}

function picked(): void {
  choosing.value = false;
  emit("navigate");
}
</script>

<template>
  <div
    v-if="compact"
    class="flex justify-center pb-2"
  >
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-control border border-navy-line hover:border-gold-light"
      :title="campaign ? campaign.name : t('common.shell.chooseCampaign')"
      :aria-label="campaign ? `${campaign.name} – ${t('common.shell.switchCampaign')}` : t('common.shell.chooseCampaign')"
      @click="expand"
    >
      <Icon
        name="nav-kampagne"
        :size="22"
        class="text-gold-light"
      />
    </button>
  </div>
  <div
    v-else
    class="px-4 pb-2"
  >
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-control border px-3 py-2 text-left text-parchment"
      :class="campaign ? 'border-navy-line bg-navy-900 hover:bg-navy-800' : 'border-dashed border-gold-light/60 hover:bg-navy-800'"
      :aria-expanded="choosing || !campaign"
      @click="choosing = !choosing"
    >
      <Icon
        name="nav-kampagne"
        :size="22"
        class="shrink-0 text-gold-light"
      />
      <span class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-[15.5px]">{{ campaign?.name ?? t("common.shell.chooseCampaign") }}</span>
        <span class="block truncate text-[12.5px] text-parchment/65">{{ subline }}</span>
      </span>
      <Icon
        :name="choosing ? 'ui-chevron-up' : 'ui-chevron-down'"
        :size="16"
      />
    </button>
    <ul
      v-if="choosing || !campaign"
      class="mt-1 flex flex-col gap-0.5"
    >
      <li
        v-for="entry in list"
        :key="entry.id"
      >
        <RouterLink
          :to="campaignHomePath(entry)"
          class="flex w-full items-center gap-2.5 rounded-control px-3 py-1.5 text-[15px] text-parchment hover:bg-navy-800"
          :class="entry.id === campaign?.id && 'text-gold-light'"
          :aria-current="entry.id === campaign?.id ? 'true' : undefined"
          @click="picked"
        >
          <Icon
            name="nav-kampagne"
            :size="18"
            class="shrink-0"
          />
          <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
          <span
            v-if="entry.role"
            class="text-[12px] text-parchment/60"
          >{{ t(roleMessageKey(entry.role)) }}</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink
          to="/dashboard"
          class="flex w-full items-center gap-2.5 rounded-control px-3 py-1.5 text-[15px] text-parchment/80 hover:bg-navy-800"
          @click="picked"
        >
          <Icon
            name="nav-dashboard"
            :size="18"
            class="shrink-0"
          />{{ t("common.shell.allCampaigns") }}
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
