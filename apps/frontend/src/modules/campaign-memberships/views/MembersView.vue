<script setup lang="ts">
/**
 * Members of the campaign (sharing page, first tab): who belongs, in which role, since when.
 * Game master and co-authors change roles in the value editor (412 shows there and reloads the
 * list; an own role change reloads the campaign, so rights and area follow at once) and remove
 * members after a confirmation; the game master (owner) keeps their role and stays. Players
 * never get here: the navigation hides the page and the API refuses the changes anyway.
 */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";

import Avatar from "@/components/base/Avatar.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import EditableValue from "@/components/base/EditableValue.vue";
import ModalDialog from "@/components/content/ModalDialog.vue";
import DataTable, { type TableColumn } from "@/components/data/DataTable.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey, isVersionConflict } from "@/core/api/errors";
import { meQuery } from "@/core/auth/session";
import { campaignQuery, roleMessageKey, useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";
import { useCan } from "@/core/permissions/useCan";
import { editValues } from "@/core/ui/valueEditor";
import RoleBadge from "@/modules/campaigns/components/RoleBadge.vue";

import { type CampaignMember, changeMemberRole, isManagedMember, type MemberRole, removeMember } from "../api";
import SharingHeader from "../components/SharingHeader.vue";
import { membersQuery } from "../queries";

const { t } = useAppI18n();
const { date } = useFormat();
const { can } = useCan();
const { campaignId } = useCurrentCampaign();
const queryClient = useQueryClient();
const me = useQuery(meQuery);

const members = useQuery(
  computed(() => ({ ...membersQuery(campaignId.value ?? ""), enabled: !!campaignId.value })),
);
const rows = computed(() => members.data.value?.data ?? []);
const canChangeRoles = computed(() => can("campaignMembers.updateRole"));
const canRemove = computed(() => can("campaignMembers.revoke"));

const columns = computed<TableColumn[]>(() => [
  { key: "member", label: t("campaign-memberships.members.columns.member"), width: "45%" },
  { key: "role", label: t("campaign-memberships.members.columns.role") },
  { key: "joined", label: t("campaign-memberships.members.columns.joined") },
]);

const isMe = (member: CampaignMember) => member.userTag === me.data.value?.userTag;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function refresh(): Promise<void> {
  if (campaignId.value) await queryClient.invalidateQueries({ queryKey: membersQuery(campaignId.value).queryKey });
}

const ROLES: MemberRole[] = ["PLAYER", "EDITOR"];

function editRole(member: CampaignMember, anchor: HTMLElement): void {
  if (!isManagedMember(member) || !campaignId.value) return;
  const id = campaignId.value;
  editValues(anchor, {
    title: t("campaign-memberships.members.roleOf", { name: member.displayName }),
    hint: t("campaign-memberships.members.roleHint"),
    fields: [
      {
        key: "role",
        type: "select",
        label: t("campaign-memberships.members.columns.role"),
        value: member.role,
        options: ROLES.map((role) => ({ value: role, label: t(roleMessageKey(role)) })),
      },
    ],
    onSave: async (values) => {
      try {
        await changeMemberRole(id, member.id, { role: values.role as MemberRole, expectedVersion: member.version });
      } catch (error) {
        // Somebody changed the membership meanwhile: the list loads the new version, the editor
        // shows the conflict, and the next try starts from what is current.
        if (isVersionConflict(error)) await refresh();
        throw error;
      }
      await refresh();
      // A changed own role changes the rights and maybe the area: the campaign answers anew,
      // and the access watch takes it from there.
      if (isMe(member)) await queryClient.invalidateQueries({ queryKey: campaignQuery(id).queryKey });
    },
  });
}

const changeable = (member: CampaignMember) => canChangeRoles.value && !member.isOwner && isManagedMember(member);

function menu(member: CampaignMember): DropdownItem[] {
  return [
    ...(changeable(member)
      ? [{ label: t("campaign-memberships.members.changeRole"), icon: "aktion-bearbeiten" as const, action: (anchor: HTMLElement) => editRole(member, anchor) }]
      : []),
    ...(changeable(member) && canRemove.value ? [{ divider: true as const }] : []),
    ...(canRemove.value && !member.isOwner
      ? [{ label: t("campaign-memberships.members.remove"), icon: "aktion-loeschen" as const, danger: true, action: () => askRemove(member) }]
      : []),
  ];
}

// Removing asks first: the person loses access at once.
const removing = ref<CampaignMember | null>(null);
const removeOpen = ref(false);
const removeBusy = ref(false);
const removeError = ref("");
function askRemove(member: CampaignMember): void {
  removing.value = member;
  removeError.value = "";
  removeOpen.value = true;
}
async function confirmRemove(): Promise<void> {
  const member = removing.value;
  if (!member || !campaignId.value) return;
  removeBusy.value = true;
  removeError.value = "";
  try {
    await removeMember(campaignId.value, member.id);
    removeOpen.value = false;
    await refresh();
  } catch (error) {
    removeError.value = t(errorMessageKey(error));
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <SharingHeader :members="members.data.value ? rows.length : null" />

  <p
    v-if="members.isPending.value"
    class="text-ink-2"
  >
    {{ t("common.states.loading") }}
  </p>
  <InfoNote
    v-else-if="members.isError.value"
    tone="danger"
  >
    {{ t(errorMessageKey(members.error.value)) }}
  </InfoNote>
  <DataTable
    v-else
    :columns="columns"
    :rows="rows"
    :caption="t('campaign-memberships.members.caption')"
    :empty-text="t('campaign-memberships.members.empty')"
  >
    <template #cell-member="{ row }">
      <span class="flex items-center gap-3">
        <Avatar
          :initials="initials(row.displayName)"
          :size="38"
        />
        <span class="min-w-0">
          <b class="block truncate text-heading">
            {{ row.displayName }}
            <span
              v-if="isMe(row)"
              class="meta font-normal"
            >({{ t("campaign-memberships.members.you") }})</span>
          </b>
          <span class="meta block truncate">{{ row.userTag }}</span>
        </span>
      </span>
    </template>
    <template #cell-role="{ row }">
      <EditableValue
        v-if="changeable(row)"
        :label="t('campaign-memberships.members.roleOf', { name: row.displayName })"
        @edit="(anchor) => editRole(row, anchor)"
      >
        <RoleBadge :role="row.role" />
      </EditableValue>
      <span
        v-else
        :title="row.isOwner ? t('campaign-memberships.members.ownerHint') : undefined"
      >
        <RoleBadge :role="row.isOwner ? 'OWNER' : row.role" />
      </span>
    </template>
    <template #cell-joined="{ row }">
      <span v-if="isManagedMember(row) && row.joinedAt">{{ date(row.joinedAt, "date") }}</span>
      <span
        v-else
        class="text-ink-3"
      >—</span>
    </template>
    <template #actions="{ row }">
      <DropdownMenu
        v-if="menu(row).length"
        :items="menu(row)"
        :label="t('campaign-memberships.members.actionsFor', { name: row.displayName })"
      />
    </template>
    <template #mobile="{ row }">
      <div class="flex items-start gap-3">
        <Avatar
          :initials="initials(row.displayName)"
          :size="40"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-heading">
            {{ row.displayName }}
            <span
              v-if="isMe(row)"
              class="meta font-normal"
            >({{ t("campaign-memberships.members.you") }})</span>
          </p>
          <p class="meta truncate">
            {{ row.userTag }}<template v-if="isManagedMember(row) && row.joinedAt">
              · {{ date(row.joinedAt, "date") }}
            </template>
          </p>
          <div class="mt-1.5">
            <RoleBadge :role="row.isOwner ? 'OWNER' : row.role" />
          </div>
        </div>
      </div>
    </template>
  </DataTable>

  <ModalDialog
    v-model="removeOpen"
    :title="t('campaign-memberships.members.removeTitle', { name: removing?.displayName ?? '' })"
  >
    <p class="text-ink-2">
      {{
        removing && isMe(removing)
          ? t("campaign-memberships.members.removeSelfText")
          : t("campaign-memberships.members.removeText", { name: removing?.displayName ?? "" })
      }}
    </p>
    <InfoNote
      v-if="removeError"
      tone="danger"
      announce
      class="mt-4"
    >
      {{ removeError }}
    </InfoNote>
    <template #footer>
      <BaseButton
        :disabled="removeBusy"
        @click="removeOpen = false"
      >
        {{ t("common.actions.cancel") }}
      </BaseButton>
      <BaseButton
        variant="danger"
        icon="aktion-loeschen"
        :disabled="removeBusy"
        @click="confirmRemove"
      >
        {{ t("campaign-memberships.members.removeConfirm") }}
      </BaseButton>
    </template>
  </ModalDialog>
</template>
