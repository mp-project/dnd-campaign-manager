<script setup lang="ts">
/** Start page of a campaign, for the game master and in the player view. */
import { computed } from "vue";

import Icon from "@/components/base/Icon.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import ExpandableText from "@/components/content/ExpandableText.vue";
import AppBreadcrumb from "@/components/page/AppBreadcrumb.vue";
import { useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";

const { t } = useAppI18n();
const { campaign } = useCurrentCampaign();
const breadcrumb = computed(() => [
  { label: t("campaigns.nav.dashboard"), to: "/dashboard" },
  { label: campaign.value?.name ?? "" },
]);
</script>

<template>
  <template v-if="campaign">
    <header class="mb-5 md:mb-6">
      <AppBreadcrumb :items="breadcrumb" />
      <div class="flex min-w-0 flex-wrap items-center gap-3 md:gap-4">
        <Icon
          name="nav-kampagne"
          :size="44"
          class="text-brand"
        />
        <h1 class="page-title min-w-0">
          {{ campaign.name }}
        </h1>
        <StatusBadge :status="campaign.status" />
      </div>
    </header>
    <section class="max-w-3xl">
      <ExpandableText
        v-if="campaign.description"
        :text="campaign.description"
        :lines="6"
      />
      <p
        v-else
        class="meta"
      >
        {{ t("campaigns.overview.noDescription") }}
      </p>
    </section>
  </template>
</template>
