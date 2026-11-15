<script setup lang="ts">
/**
 * Start page after signing in: the account's campaigns, split into those it leads (game master)
 * and those it joined, with search and a filter; "Kampagne erstellen" for accounts allowed to.
 * Owned campaigns open the game master's area, joined ones as player the player view.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import SelectInput from "@/components/base/SelectInput.vue";
import TextInput from "@/components/base/TextInput.vue";
import type { Option } from "@/components/base/types";
import InfoNote from "@/components/page/InfoNote.vue";
import PageHeader from "@/components/page/PageHeader.vue";
import { errorMessageKey } from "@/core/api/errors";
import { type Campaign, useMyCampaigns } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useCan } from "@/core/permissions/useCan";

import CampaignCard from "../components/CampaignCard.vue";
import CreateCampaignDialog from "../components/CreateCampaignDialog.vue";
import { rulesetsQuery } from "../queries";

type Filter = "all" | "owned" | "joined";

const { t } = useAppI18n();
const { canGlobally } = useCan();
const campaigns = useMyCampaigns();
const rulesets = useQuery(rulesetsQuery);

const query = ref("");
const filter = ref<Filter>("all");
const createOpen = ref(false);
const canCreate = computed(() => canGlobally("campaigns.create"));

const filterOptions = computed<Option<Filter>[]>(() => [
  { value: "all", label: t("campaigns.dashboard.filterAll") },
  { value: "owned", label: t("campaigns.dashboard.filterOwned") },
  { value: "joined", label: t("campaigns.dashboard.filterJoined") },
]);

const rulesetNames = computed(() => new Map((rulesets.data.value?.data ?? []).map((ruleset) => [ruleset.id, ruleset.name])));
const all = computed<Campaign[]>(() => campaigns.data.value?.data ?? []);
const isOwned = (campaign: Campaign) => campaign.role === "OWNER";

const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return all.value.filter(
    (campaign) =>
      (!needle || campaign.name.toLocaleLowerCase().includes(needle)) &&
      (filter.value === "all" || (filter.value === "owned") === isOwned(campaign)),
  );
});
const owned = computed(() => filtered.value.filter(isOwned));
const joined = computed(() => filtered.value.filter((campaign) => !isOwned(campaign)));

function reset(): void {
  query.value = "";
  filter.value = "all";
}
</script>

<template>
  <PageHeader
    :title="t('campaigns.dashboard.title')"
    icon="nav-dashboard"
    :subtitle="t('campaigns.dashboard.subtitle')"
    :mobile-subtitle="t('campaigns.dashboard.mobileSubtitle')"
    :breadcrumb="[{ label: t('campaigns.dashboard.breadcrumb') }, { label: t('campaigns.dashboard.title') }]"
  >
    <template
      v-if="canCreate"
      #actions
    >
      <BaseButton
        variant="primary"
        icon="aktion-hinzufuegen"
        @click="createOpen = true"
      >
        {{ t("campaigns.create.action") }}
      </BaseButton>
    </template>
    <template
      v-if="canCreate"
      #mobile-actions
    >
      <BaseButton
        variant="primary"
        icon="aktion-hinzufuegen"
        icon-only
        :label="t('campaigns.create.action')"
        @click="createOpen = true"
      />
    </template>
  </PageHeader>

  <p
    v-if="campaigns.isPending.value"
    class="meta"
  >
    {{ t("common.states.loading") }}
  </p>
  <div
    v-else-if="campaigns.isError.value"
    class="flex flex-col items-start gap-3"
  >
    <InfoNote
      tone="danger"
      announce
    >
      {{ t("campaigns.dashboard.error") }} {{ t(errorMessageKey(campaigns.error.value)) }}
    </InfoNote>
    <BaseButton
      size="sm"
      icon="ui-refresh"
      @click="campaigns.refetch()"
    >
      {{ t("common.actions.retry") }}
    </BaseButton>
  </div>

  <section
    v-else-if="all.length === 0"
    class="card-sunk flex flex-col items-center gap-3 p-8 text-center"
  >
    <Icon
      name="nav-kampagne"
      :size="48"
      class="text-ink-3"
    />
    <h2 class="section-title">
      {{ t("campaigns.dashboard.welcomeTitle") }}
    </h2>
    <p class="max-w-xl text-ink-2">
      {{ t("campaigns.dashboard.welcomeText") }}
    </p>
    <BaseButton
      v-if="canCreate"
      variant="primary"
      icon="aktion-hinzufuegen"
      @click="createOpen = true"
    >
      {{ t("campaigns.create.action") }}
    </BaseButton>
  </section>

  <template v-else>
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <div class="min-w-0 flex-1 md:max-w-xl">
        <label
          for="dashboard-search"
          class="sr-only"
        >{{ t("campaigns.dashboard.search") }}</label>
        <TextInput
          id="dashboard-search"
          v-model="query"
          type="search"
          icon="aktion-suchen"
          :placeholder="t('campaigns.dashboard.search')"
        />
      </div>
      <div class="w-full sm:w-52">
        <label
          for="dashboard-filter"
          class="sr-only"
        >{{ t("campaigns.dashboard.filter") }}</label>
        <SelectInput
          id="dashboard-filter"
          v-model="filter"
          :options="filterOptions"
        />
      </div>
    </div>

    <section
      v-if="owned.length > 0"
      class="mb-7"
      aria-labelledby="dashboard-owned"
    >
      <h2
        id="dashboard-owned"
        class="section-title mb-3 flex items-center gap-3"
      >
        <Icon
          name="orig-krone"
          :size="24"
          class="text-gold"
        /><span>{{ t("campaigns.dashboard.owned") }} <span class="num font-normal text-ink-2">({{ owned.length }})</span></span>
      </h2>
      <ul class="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
        <li
          v-for="campaign in owned"
          :key="campaign.id"
        >
          <CampaignCard
            :campaign="campaign"
            :ruleset-name="rulesetNames.get(campaign.rulesetId)"
          />
        </li>
      </ul>
    </section>

    <section
      v-if="joined.length > 0"
      class="mb-7"
      aria-labelledby="dashboard-joined"
    >
      <h2
        id="dashboard-joined"
        class="section-title mb-3 flex items-center gap-3"
      >
        <Icon
          name="ui-users"
          :size="24"
          class="text-gold"
        /><span>{{ t("campaigns.dashboard.joined") }} <span class="num font-normal text-ink-2">({{ joined.length }})</span></span>
      </h2>
      <ul class="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
        <li
          v-for="campaign in joined"
          :key="campaign.id"
        >
          <CampaignCard
            :campaign="campaign"
            :ruleset-name="rulesetNames.get(campaign.rulesetId)"
          />
        </li>
      </ul>
    </section>

    <div
      v-if="filtered.length === 0"
      class="card-sunk flex flex-col items-center gap-3 p-8 text-center"
    >
      <Icon
        name="nav-kampagne"
        :size="40"
        class="text-ink-3"
      />
      <p>{{ t("campaigns.dashboard.noMatch") }}</p>
      <BaseButton @click="reset">
        {{ t("campaigns.dashboard.resetSearch") }}
      </BaseButton>
    </div>
  </template>

  <CreateCampaignDialog
    v-if="canCreate"
    v-model="createOpen"
  />
</template>
