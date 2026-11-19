<script setup lang="ts">
/**
 * The signed-in account's pending invitations on the dashboard: campaign, who invited, the role
 * and until when; accept opens the campaign, decline drops the invitation. One that was taken
 * back or expired meanwhile says so and leaves the list. Nothing shows while there is none, so
 * the dashboard stays as it was.
 */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import { campaignHomePath, campaignQuery, myCampaignsQuery, roleMessageKey } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";

import { acceptMyInvitation, declineMyInvitation, type MyInvitation } from "../api";
import { isGoneInvitationError, useInvitationErrorText } from "../errors";
import { myInvitationsQuery } from "../queries";

const { t } = useAppI18n();
const { date } = useFormat();
const router = useRouter();
const queryClient = useQueryClient();
const errorText = useInvitationErrorText();
const invitations = useQuery(myInvitationsQuery);
const list = computed(() => invitations.data.value?.data ?? []);

const busy = ref<string | null>(null);
const failure = ref("");
const notice = ref("");

async function refresh(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: myInvitationsQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: myCampaignsQuery.queryKey }),
  ]);
}

async function accept(invitation: MyInvitation): Promise<void> {
  busy.value = invitation.invitationId;
  failure.value = "";
  try {
    const { campaignId } = await acceptMyInvitation(invitation.invitationId);
    await refresh();
    await router.push(campaignHomePath(await queryClient.fetchQuery(campaignQuery(campaignId))));
  } catch (error) {
    failure.value = errorText(error);
    if (isGoneInvitationError(error)) await refresh();
  } finally {
    busy.value = null;
  }
}

async function decline(invitation: MyInvitation): Promise<void> {
  busy.value = invitation.invitationId;
  failure.value = "";
  notice.value = "";
  try {
    await declineMyInvitation(invitation.invitationId);
    notice.value = t("campaign-invitations.mine.declined", { campaign: invitation.campaignName });
    await refresh();
  } catch (error) {
    failure.value = errorText(error);
    if (isGoneInvitationError(error)) await refresh();
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <SectionCard
    v-if="list.length || notice || failure"
    :title="list.length ? t('campaign-invitations.mine.count', list.length, { count: list.length }) : t('campaign-invitations.mine.title')"
    icon="ui-mail"
  >
    <ul class="flex flex-col divide-y divide-line">
      <li
        v-for="invitation in list"
        :key="invitation.invitationId"
        class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-heading text-[17px] text-heading">
            {{ invitation.campaignName }}
          </p>
          <p class="meta">
            {{
              invitation.invitedByName
                ? t("campaign-invitations.mine.from", { name: invitation.invitedByName, role: t(roleMessageKey(invitation.role)) })
                : t("campaign-invitations.mine.fromUnknown", { role: t(roleMessageKey(invitation.role)) })
            }}
            · {{ t("campaign-invitations.mine.until", { date: date(invitation.expiresAt, "date") }) }}
          </p>
        </div>
        <div class="flex gap-2">
          <BaseButton
            variant="primary"
            size="sm"
            icon="ui-check"
            :disabled="busy !== null"
            @click="accept(invitation)"
          >
            {{ t("campaign-invitations.mine.accept") }}
          </BaseButton>
          <BaseButton
            size="sm"
            :disabled="busy !== null"
            @click="decline(invitation)"
          >
            {{ t("campaign-invitations.mine.decline") }}
          </BaseButton>
        </div>
      </li>
    </ul>
    <InfoNote
      v-if="notice"
      tone="info"
      announce
      :class="list.length && 'mt-3'"
    >
      {{ notice }}
    </InfoNote>
    <InfoNote
      v-if="failure"
      tone="danger"
      announce
      class="mt-3"
    >
      {{ failure }}
    </InfoNote>
  </SectionCard>
</template>
