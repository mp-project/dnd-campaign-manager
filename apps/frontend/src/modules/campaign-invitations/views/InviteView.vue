<script setup lang="ts">
/**
 * Inviting to the campaign (child route of the invitations list, in the editor drawer): by email
 * address or by user tag (checked against the accounts first), the role and how long the link
 * stays valid. The backend emails the link; afterwards the list shows the new invitation.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import Icon from "@/components/base/Icon.vue";
import SegmentedControl from "@/components/base/SegmentedControl.vue";
import SelectInput from "@/components/base/SelectInput.vue";
import TextInput from "@/components/base/TextInput.vue";
import EditorDrawer from "@/components/editor/EditorDrawer.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey, isApiError } from "@/core/api/errors";
import { isEmail } from "@/core/auth/accountRules";
import { roleMessageKey, useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";

import { createInvitation, type InvitationRole, lookupUserTag } from "../api";
import { invitationsQuery } from "../queries";

type Mode = "email" | "tag";

const { t } = useAppI18n();
const router = useRouter();
const queryClient = useQueryClient();
const { campaign, campaignId, segment } = useCurrentCampaign();

const list = computed(() => ({ name: "campaign-invitations", params: { campaign: segment.value ?? "" } }));
const section = ref("invitation");
const sections = computed(() => [
  {
    id: "invitation",
    label: t("campaign-invitations.invite.section"),
    icon: "ui-mail" as const,
    description: t("campaign-invitations.invite.sectionHint"),
  },
]);

const ROLES: InvitationRole[] = ["PLAYER", "EDITOR"];
const DAYS = [3, 7, 14, 30];
const form = reactive({ mode: "email" as Mode, email: "", userTag: "", role: "PLAYER" as InvitationRole, days: 7 });
const errors = reactive({ email: "", userTag: "" });
const failure = ref("");
const busy = ref(false);

const modes = computed(() => [
  { value: "email" as Mode, label: t("campaign-invitations.invite.byEmail"), icon: "ui-mail" as const },
  { value: "tag" as Mode, label: t("campaign-invitations.invite.byTag"), icon: "ui-user" as const },
]);
const roleOptions = computed(() => ROLES.map((role) => ({ value: role, label: t(roleMessageKey(role)) })));
const dayOptions = computed(() => DAYS.map((days) => ({ value: days, label: t("campaign-invitations.invite.days", days, { count: days }) })));
// i18n-dynamic: campaign-invitations.invite.roleHints.*
const roleHint = computed(() => t(`campaign-invitations.invite.roleHints.${form.role}`));

// Checking a user tag shows whose account it is before inviting.
const found = ref<string | null>(null);
const checking = ref(false);
watch(
  () => form.userTag,
  () => {
    found.value = null;
    errors.userTag = "";
  },
);
async function check(): Promise<void> {
  const userTag = form.userTag.trim();
  if (!userTag || !campaignId.value) {
    errors.userTag = t("campaign-invitations.invite.validation.userTag");
    return;
  }
  checking.value = true;
  try {
    found.value = (await lookupUserTag(campaignId.value, userTag)).displayName;
  } catch (error) {
    errors.userTag =
      isApiError(error) && error.status === 404 ? t("campaign-invitations.invite.notFound") : t(errorMessageKey(error));
  } finally {
    checking.value = false;
  }
}

function validate(): boolean {
  errors.email = form.mode === "email" && !isEmail(form.email) ? t("campaign-invitations.invite.validation.email") : "";
  errors.userTag = form.mode === "tag" && !form.userTag.trim() ? t("campaign-invitations.invite.validation.userTag") : "";
  return !errors.email && !errors.userTag;
}

async function save(): Promise<void> {
  failure.value = "";
  if (!validate() || !campaignId.value) return;
  busy.value = true;
  try {
    const target = form.mode === "email" ? { email: form.email.trim() } : { userTag: form.userTag.trim() };
    await createInvitation(campaignId.value, { ...target, role: form.role, expiresInDays: form.days });
    await queryClient.invalidateQueries({ queryKey: invitationsQuery(campaignId.value).queryKey });
    await router.push(list.value);
  } catch (error) {
    if (isApiError(error) && error.status === 404 && form.mode === "tag") errors.userTag = t("campaign-invitations.invite.notFound");
    else failure.value = isApiError(error) && error.status === 409 ? t("campaign-invitations.invite.conflict") : t(errorMessageKey(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <EditorDrawer
    v-model="section"
    :title="t('campaign-invitations.invite.title')"
    :sections="sections"
    icon="ui-mail"
    :save-label="t('campaign-invitations.invite.send')"
    :close-to="list"
    :busy="busy"
    width="640px"
    @save="save"
  >
    <div class="flex flex-col gap-5">
      <p class="text-ink-2">
        {{ t("campaign-invitations.invite.intro", { campaign: campaign?.name ?? "" }) }}
      </p>

      <SegmentedControl
        v-model="form.mode"
        :options="modes"
        :label="t('campaign-invitations.invite.by')"
      />

      <FormField
        v-if="form.mode === 'email'"
        v-slot="field"
        :label="t('campaign-invitations.invite.email')"
        :hint="t('campaign-invitations.invite.emailHint')"
        :error="errors.email"
        required
      >
        <TextInput
          :id="field.id"
          v-model="form.email"
          type="email"
          icon="ui-mail"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          maxlength="320"
          placeholder="name@example.com"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        v-else
        v-slot="field"
        :label="t('campaign-invitations.invite.userTag')"
        :hint="t('campaign-invitations.invite.userTagHint')"
        :error="errors.userTag"
        required
      >
        <div class="flex gap-2">
          <TextInput
            :id="field.id"
            v-model="form.userTag"
            icon="ui-user"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="40"
            class="min-w-0 flex-1"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
          <BaseButton
            size="md"
            :disabled="checking"
            @click="check"
          >
            {{ t("campaign-invitations.invite.check") }}
          </BaseButton>
        </div>
        <p
          v-if="found"
          class="flex items-center gap-1.5 text-[0.875rem] text-ok"
          role="status"
        >
          <Icon
            name="ui-check-circle"
            :size="16"
          />{{ t("campaign-invitations.invite.found", { name: found }) }}
        </p>
      </FormField>

      <FormField
        v-slot="field"
        :label="t('campaign-invitations.invite.role')"
        :hint="roleHint"
      >
        <SelectInput
          :id="field.id"
          v-model="form.role"
          :options="roleOptions"
          :aria-describedby="field.describedby"
        />
      </FormField>

      <FormField
        v-slot="field"
        :label="t('campaign-invitations.invite.expires')"
      >
        <SelectInput
          :id="field.id"
          v-model="form.days"
          :options="dayOptions"
        />
      </FormField>

      <InfoNote
        v-if="failure"
        tone="danger"
        announce
      >
        {{ failure }}
      </InfoNote>
    </div>
  </EditorDrawer>
</template>
