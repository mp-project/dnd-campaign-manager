<script setup lang="ts">
/** The account's campaigns; each leads to its overview (players to the player view). */
import Icon from "@/components/base/Icon.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import { errorMessageKey } from "@/core/api/errors";
import { campaignHomePath, roleMessageKey, useMyCampaigns } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";

const { t } = useAppI18n();
const campaigns = useMyCampaigns();
</script>

<template>
  <header class="mb-5 md:mb-6">
    <div class="flex items-center gap-3 md:gap-4">
      <Icon
        name="nav-dashboard"
        :size="44"
        class="text-brand"
      />
      <h1 class="page-title">
        {{ t("campaigns.dashboard.title") }}
      </h1>
    </div>
    <p class="mt-1.5 text-[17px] text-ink-2 md:text-[18px]">
      {{ t("campaigns.dashboard.subtitle") }}
    </p>
  </header>

  <section :aria-label="t('campaigns.dashboard.campaigns')">
    <p
      v-if="campaigns.isPending.value"
      class="meta"
    >
      {{ t("common.states.loading") }}
    </p>
    <div
      v-else-if="campaigns.isError.value"
      class="flex flex-wrap items-center gap-3"
      role="alert"
    >
      <span>{{ t("campaigns.dashboard.error") }} {{ t(errorMessageKey(campaigns.error.value)) }}</span>
      <BaseButton
        size="sm"
        icon="ui-refresh"
        @click="campaigns.refetch()"
      >
        {{ t("common.actions.retry") }}
      </BaseButton>
    </div>
    <p
      v-else-if="(campaigns.data.value?.data.length ?? 0) === 0"
      class="max-w-xl text-ink-2"
    >
      {{ t("campaigns.dashboard.empty") }}
    </p>
    <ul
      v-else
      class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <li
        v-for="campaign in campaigns.data.value?.data"
        :key="campaign.id"
      >
        <RouterLink
          :to="campaignHomePath(campaign)"
          class="card flex h-full flex-col gap-2 p-4 hover:border-gold"
        >
          <span class="flex items-start gap-3">
            <Icon
              name="nav-kampagne"
              :size="28"
              class="shrink-0 text-brand"
            />
            <span class="section-title min-w-0 flex-1 truncate">{{ campaign.name }}</span>
          </span>
          <span class="flex flex-wrap items-center gap-2">
            <StatusBadge :status="campaign.status" />
            <span
              v-if="campaign.role"
              class="meta"
            >{{ t(roleMessageKey(campaign.role)) }}</span>
          </span>
          <span
            v-if="campaign.description"
            class="line-clamp-2 text-ink-2"
          >{{ campaign.description }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
