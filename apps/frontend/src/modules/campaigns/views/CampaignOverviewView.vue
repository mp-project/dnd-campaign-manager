<script setup lang="ts">
/**
 * Start page of a campaign, for the game master and in the player view: banner with ruleset,
 * name and role, what it's about, the party (members), the campaign's state (game day, long
 * rests) and the next session (empty until sessions exist). Campaigns have no picture yet, so
 * the banner is the navy band with the compass rose.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

import Avatar from "@/components/base/Avatar.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import ExpandableText from "@/components/content/ExpandableText.vue";
import WingSeal from "@/components/layout/WingSeal.vue";
import AppBreadcrumb from "@/components/page/AppBreadcrumb.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import StatTile from "@/components/data/StatTile.vue";
import { errorMessageKey } from "@/core/api/errors";
import { useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";
import { membersQuery } from "@/modules/campaign-memberships/queries";

import RoleBadge from "../components/RoleBadge.vue";
import { rulesetsQuery } from "../queries";

const { t } = useAppI18n();
const { date, number } = useFormat();
const { campaign } = useCurrentCampaign();
const rulesets = useQuery(rulesetsQuery);
const members = useQuery(
  computed(() => ({ ...membersQuery(campaign.value?.id ?? ""), enabled: !!campaign.value })),
);

const rulesetName = computed(
  () => rulesets.data.value?.data.find((ruleset) => ruleset.id === campaign.value?.rulesetId)?.name ?? "",
);
// Players get a slimmer view without status, which lists active members only.
const activeMembers = computed(() =>
  (members.data.value?.data ?? []).filter((member) => !("status" in member) || member.status === "ACTIVE"),
);
const breadcrumb = computed(() => [
  { label: t("campaigns.nav.dashboard"), to: "/dashboard" },
  { label: campaign.value?.name ?? "" },
]);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
</script>

<template>
  <template v-if="campaign">
    <AppBreadcrumb :items="breadcrumb" />
    <section class="relative mb-5 overflow-hidden rounded-card border border-gold bg-navy-950 text-parchment">
      <WingSeal
        :size="220"
        tone="navy"
        class="pointer-events-none absolute -top-10 -right-10 opacity-40"
      />
      <div class="relative flex flex-col gap-2 p-4 md:p-6">
        <p
          v-if="rulesetName"
          class="eyebrow text-gold-light"
        >
          {{ t("campaigns.overview.eyebrow", { ruleset: rulesetName }) }}
        </p>
        <h1 class="page-title text-parchment-card! min-w-0 break-words">
          {{ campaign.name }}
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <RoleBadge
            v-if="campaign.role"
            :role="campaign.role"
          />
          <StatusBadge
            v-if="campaign.status !== 'ACTIVE'"
            :status="campaign.status"
          />
          <span class="text-[15px] text-parchment/80">{{ t("campaigns.overview.createdAt", { date: date(campaign.createdAt) }) }}</span>
        </div>
      </div>
    </section>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div class="flex flex-col gap-5">
        <SectionCard
          :title="t('campaigns.overview.about')"
          icon="nav-kampagne"
        >
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
        </SectionCard>

        <SectionCard
          :title="t('campaigns.overview.nextSession')"
          icon="nav-sessions"
        >
          <p class="text-ink-2">
            {{ t("campaigns.overview.nextSessionEmpty") }}
          </p>
        </SectionCard>
      </div>

      <div class="flex flex-col gap-5">
        <SectionCard
          :title="t('campaigns.overview.group')"
          icon="nav-charaktere"
        >
          <p
            v-if="members.isPending.value"
            class="meta"
          >
            {{ t("common.states.loading") }}
          </p>
          <InfoNote
            v-else-if="members.isError.value"
            tone="danger"
          >
            {{ t(errorMessageKey(members.error.value)) }}
          </InfoNote>
          <p
            v-else-if="activeMembers.length === 0"
            class="text-ink-2"
          >
            {{ t("campaigns.overview.groupEmpty") }}
          </p>
          <ul
            v-else
            class="flex flex-col gap-2"
          >
            <li
              v-for="member in activeMembers"
              :key="member.id"
              class="flex items-center gap-3 rounded-control border border-line bg-parchment p-2.5"
            >
              <Avatar
                :initials="initials(member.displayName)"
                :size="40"
              />
              <span class="min-w-0 flex-1">
                <span class="name-link block truncate">{{ member.displayName }}</span>
                <span class="meta block truncate">{{ member.userTag }}</span>
              </span>
              <RoleBadge :role="member.isOwner ? 'OWNER' : member.role" />
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          :title="t('campaigns.overview.state')"
          icon="ui-calendar"
        >
          <div class="grid grid-cols-2">
            <StatTile
              :label="t('campaigns.overview.gameDay')"
              :value="number(campaign.currentGameDay)"
              icon="ui-calendar"
            />
            <StatTile
              :label="t('campaigns.overview.longRests')"
              :value="number(campaign.longRestCount)"
              icon="ui-hourglass"
            />
          </div>
        </SectionCard>
      </div>
    </div>
  </template>
</template>
