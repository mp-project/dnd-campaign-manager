<script setup lang="ts">
/**
 * A campaign on the dashboard. Desktop: card with a banner band on top and "Öffnen" at the bottom,
 * all cards of a row equally high; mobile: a row with the band on the left. Campaigns have no
 * picture yet, so the band shows the compass rose.
 */
import Badge from "@/components/base/Badge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import WingSeal from "@/components/layout/WingSeal.vue";
import { type Campaign, campaignHomePath } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";

import RoleBadge from "./RoleBadge.vue";

defineProps<{ campaign: Campaign; rulesetName?: string }>();
const { t } = useAppI18n();
</script>

<template>
  <article class="card flex h-full gap-3 p-2 md:flex-col md:gap-0 md:p-1.5">
    <div
      class="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-[6px] bg-navy-900 sm:w-[112px] md:h-[96px] md:w-full"
      aria-hidden="true"
    >
      <WingSeal
        :size="48"
        tone="navy"
      />
    </div>
    <div class="flex min-w-0 flex-1 flex-col md:px-3 md:pt-2.5 md:pb-2">
      <h3 class="name-link text-[18px] leading-tight break-words">
        {{ campaign.name }}
      </h3>
      <div class="mt-1.5 flex flex-wrap items-center gap-1.5 md:gap-2">
        <RoleBadge
          v-if="campaign.role"
          :role="campaign.role"
        />
        <Badge
          v-if="rulesetName"
          tone="outline"
          icon="nav-regelwerk"
        >
          {{ rulesetName }}
        </Badge>
        <StatusBadge
          v-if="campaign.status !== 'ACTIVE'"
          :status="campaign.status"
        />
      </div>
      <p
        v-if="campaign.description"
        class="mt-2 hidden text-[15px] text-ink-2 md:line-clamp-2"
      >
        {{ campaign.description }}
      </p>
      <BaseButton
        variant="primary"
        icon="aktion-ansehen"
        size="md"
        class="mt-2 self-end md:mt-auto md:w-full md:self-stretch md:pt-0"
        :to="campaignHomePath(campaign)"
        :aria-label="t('campaigns.card.openLabel', { name: campaign.name })"
      >
        {{ t("campaigns.card.open") }}
      </BaseButton>
    </div>
  </article>
</template>
