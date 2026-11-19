<script setup lang="ts">
/**
 * Pending invitations of the campaign (sharing page, second tab; game master only, like the
 * API): whom, in which role, sent and valid until; each can be taken back after a confirmation.
 * The list holds pending ones only (the API's), so it shows no status.
 * Inviting is a child route (`…/einladungen/neu`) in the editor drawer over this list.
 */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import Icon from "@/components/base/Icon.vue";
import ModalDialog from "@/components/content/ModalDialog.vue";
import DataTable, { type TableColumn } from "@/components/data/DataTable.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey } from "@/core/api/errors";
import { useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";
import { useCan } from "@/core/permissions/useCan";
import SharingHeader from "@/modules/campaign-memberships/components/SharingHeader.vue";
import { membersQuery } from "@/modules/campaign-memberships/queries";
import RoleBadge from "@/modules/campaigns/components/RoleBadge.vue";

import { type CampaignInvitation, revokeInvitation } from "../api";
import { invitationsQuery } from "../queries";

const { t } = useAppI18n();
const { date } = useFormat();
const { can } = useCan();
const { campaignId } = useCurrentCampaign();
const queryClient = useQueryClient();

const enabled = computed(() => !!campaignId.value);
const invitations = useQuery(computed(() => ({ ...invitationsQuery(campaignId.value ?? ""), enabled: enabled.value })));
const members = useQuery(computed(() => ({ ...membersQuery(campaignId.value ?? ""), enabled: enabled.value })));
const rows = computed(() => invitations.data.value?.data ?? []);

const columns = computed<TableColumn[]>(() => [
  { key: "target", label: t("campaign-invitations.list.columns.target"), width: "36%" },
  { key: "role", label: t("campaign-invitations.list.columns.role") },
  { key: "sent", label: t("campaign-invitations.list.columns.sent") },
  { key: "expires", label: t("campaign-invitations.list.columns.expires") },
]);

/** By user tag the account (its address stays private); by email the address it went to. */
const target = (invitation: CampaignInvitation) =>
  invitation.userTag ?? invitation.email ?? t("campaign-invitations.list.accountGone");

function menu(invitation: CampaignInvitation): DropdownItem[] {
  return can("campaignInvitations.revoke")
    ? [{ label: t("campaign-invitations.list.revoke"), icon: "aktion-loeschen", danger: true, action: () => askRevoke(invitation) }]
    : [];
}

const revoking = ref<CampaignInvitation | null>(null);
const revokeOpen = ref(false);
const revokeBusy = ref(false);
const revokeError = ref("");
function askRevoke(invitation: CampaignInvitation): void {
  revoking.value = invitation;
  revokeError.value = "";
  revokeOpen.value = true;
}
async function confirmRevoke(): Promise<void> {
  const invitation = revoking.value;
  if (!invitation || !campaignId.value) return;
  revokeBusy.value = true;
  revokeError.value = "";
  try {
    await revokeInvitation(campaignId.value, invitation.id);
    revokeOpen.value = false;
    await queryClient.invalidateQueries({ queryKey: invitationsQuery(campaignId.value).queryKey });
  } catch (error) {
    revokeError.value = t(errorMessageKey(error));
  } finally {
    revokeBusy.value = false;
  }
}
</script>

<template>
  <SharingHeader
    :members="members.data.value ? members.data.value.data.length : null"
    :invitations="invitations.data.value ? rows.length : null"
  />

  <p
    v-if="invitations.isPending.value"
    class="text-ink-2"
  >
    {{ t("common.states.loading") }}
  </p>
  <InfoNote
    v-else-if="invitations.isError.value"
    tone="danger"
  >
    {{ t(errorMessageKey(invitations.error.value)) }}
  </InfoNote>
  <template v-else>
    <DataTable
      :columns="columns"
      :rows="rows"
      :caption="t('campaign-invitations.list.caption')"
      :empty-text="t('campaign-invitations.list.empty')"
    >
      <template #cell-target="{ row }">
        <span class="inline-flex min-w-0 items-center gap-2">
          <Icon
            :name="row.userTag ? 'ui-user' : 'ui-mail'"
            :size="18"
            class="shrink-0 text-gold"
          />
          <span class="truncate">{{ target(row) }}</span>
        </span>
      </template>
      <template #cell-role="{ row }">
        <RoleBadge :role="row.role" />
      </template>
      <template #cell-sent="{ row }">
        {{ date(row.createdAt, "date") }}
      </template>
      <template #cell-expires="{ row }">
        {{ date(row.expiresAt, "date") }}
      </template>
      <template #actions="{ row }">
        <DropdownMenu
          v-if="menu(row).length"
          :items="menu(row)"
          :label="t('campaign-invitations.list.actionsFor', { target: target(row) })"
        />
      </template>
      <template #mobile="{ row }">
        <div class="flex items-start gap-3">
          <Icon
            :name="row.userTag ? 'ui-user' : 'ui-mail'"
            :size="24"
            class="mt-0.5 shrink-0 text-gold"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-heading">
              {{ target(row) }}
            </p>
            <p class="meta">
              {{ t("campaign-invitations.list.sentOn", { date: date(row.createdAt, "date") }) }} ·
              {{ t("campaign-invitations.list.until", { date: date(row.expiresAt, "date") }) }}
            </p>
            <div class="mt-1.5">
              <RoleBadge :role="row.role" />
            </div>
          </div>
        </div>
      </template>
    </DataTable>
    <InfoNote class="mt-4">
      {{ t("campaign-invitations.list.note") }}
    </InfoNote>
  </template>

  <ModalDialog
    v-model="revokeOpen"
    :title="t('campaign-invitations.list.revokeTitle')"
  >
    <p class="text-ink-2">
      {{ t("campaign-invitations.list.revokeText", { target: revoking ? target(revoking) : "" }) }}
    </p>
    <InfoNote
      v-if="revokeError"
      tone="danger"
      announce
      class="mt-4"
    >
      {{ revokeError }}
    </InfoNote>
    <template #footer>
      <BaseButton
        :disabled="revokeBusy"
        @click="revokeOpen = false"
      >
        {{ t("common.actions.cancel") }}
      </BaseButton>
      <BaseButton
        variant="danger"
        icon="aktion-loeschen"
        :disabled="revokeBusy"
        @click="confirmRevoke"
      >
        {{ t("campaign-invitations.list.revoke") }}
      </BaseButton>
    </template>
  </ModalDialog>

  <RouterView :key="$route.fullPath" />
</template>
