<script setup lang="ts">
/**
 * "Kampagne erstellen": name and ruleset are required, a short description is optional. The
 * ruleset can't be changed later. Afterwards the new campaign opens. Templates from the
 * marketplace follow with it.
 */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import Icon from "@/components/base/Icon.vue";
import RadioCard from "@/components/base/RadioCard.vue";
import TextArea from "@/components/base/TextArea.vue";
import TextInput from "@/components/base/TextInput.vue";
import ModalDialog from "@/components/content/ModalDialog.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey } from "@/core/api/errors";
import { campaignHomePath, myCampaignsQuery } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";

import { createCampaign } from "../api";
import { rulesetsQuery } from "../queries";

const open = defineModel<boolean>({ default: false });
const { t } = useAppI18n();
const router = useRouter();
const queryClient = useQueryClient();
const rulesets = useQuery(rulesetsQuery);

const form = reactive({ name: "", rulesetId: "", description: "" });
const errors = reactive({ name: "", rulesetId: "" });
const failure = ref("");
const busy = ref(false);

/** With one ruleset only there is nothing to choose. */
function preselectRuleset(): void {
  const list = rulesets.data.value?.data;
  if (list?.length === 1 && !form.rulesetId) form.rulesetId = list[0]!.id;
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  Object.assign(form, { name: "", rulesetId: "", description: "" });
  Object.assign(errors, { name: "", rulesetId: "" });
  failure.value = "";
  preselectRuleset();
});
watch(() => rulesets.data.value?.data, preselectRuleset, { immediate: true });

async function submit(): Promise<void> {
  failure.value = "";
  const name = form.name.trim();
  errors.name = name.length >= 1 && name.length <= 160 ? "" : t("campaigns.create.nameRequired");
  errors.rulesetId = form.rulesetId ? "" : t("campaigns.create.rulesetRequired");
  if (errors.name || errors.rulesetId) return;

  busy.value = true;
  try {
    const description = form.description.trim();
    const campaign = await createCampaign({ name, rulesetId: form.rulesetId, ...(description ? { description } : {}) });
    await queryClient.invalidateQueries({ queryKey: myCampaignsQuery.queryKey });
    open.value = false;
    await router.push(campaignHomePath(campaign));
  } catch (error) {
    failure.value = t(errorMessageKey(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ModalDialog
    v-model="open"
    :title="t('campaigns.create.title')"
    width="640px"
    :close-label="t('common.actions.close')"
  >
    <form
      id="create-campaign"
      class="flex flex-col gap-5"
      novalidate
      @submit.prevent="submit"
    >
      <FormField
        v-slot="field"
        :label="t('campaigns.create.name')"
        :error="errors.name"
        required
      >
        <TextInput
          :id="field.id"
          v-model="form.name"
          maxlength="160"
          :placeholder="t('campaigns.create.namePlaceholder')"
          :invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>

      <fieldset>
        <legend class="label mb-2">
          {{ t("campaigns.create.ruleset") }}<span
            class="ml-1 text-brand"
            aria-hidden="true"
          >*</span>
        </legend>
        <p
          v-if="rulesets.isPending.value"
          class="text-ink-2"
        >
          {{ t("common.states.loading") }}
        </p>
        <InfoNote
          v-else-if="rulesets.isError.value"
          tone="danger"
        >
          {{ t(errorMessageKey(rulesets.error.value)) }}
        </InfoNote>
        <InfoNote
          v-else-if="(rulesets.data.value?.data.length ?? 0) === 0"
          tone="warn"
        >
          {{ t("campaigns.create.noRulesets") }}
        </InfoNote>
        <div
          v-else
          class="grid gap-3 sm:grid-cols-2"
        >
          <RadioCard
            v-for="ruleset in rulesets.data.value?.data"
            :key="ruleset.id"
            v-model="form.rulesetId"
            name="ruleset"
            :value="ruleset.id"
            :label="ruleset.name"
            :description="ruleset.description ?? undefined"
            icon="nav-regelwerk"
          />
        </div>
        <p
          v-if="errors.rulesetId"
          class="mt-2 flex items-center gap-1.5 text-[14px] text-danger"
        >
          <Icon
            name="ui-alert"
            :size="16"
          />{{ errors.rulesetId }}
        </p>
      </fieldset>
      <InfoNote>{{ t("campaigns.create.rulesetHint") }}</InfoNote>

      <FormField
        v-slot="field"
        :label="t('campaigns.create.description')"
        :hint="t('campaigns.create.descriptionHint')"
      >
        <TextArea
          :id="field.id"
          v-model="form.description"
          :rows="3"
          :placeholder="t('campaigns.create.descriptionPlaceholder')"
          :aria-describedby="field.describedby"
        />
      </FormField>

      <InfoNote
        v-if="failure"
        tone="danger"
        announce
      >
        {{ failure }}
      </InfoNote>
    </form>
    <template #footer>
      <BaseButton
        :disabled="busy"
        @click="open = false"
      >
        {{ t("common.actions.cancel") }}
      </BaseButton>
      <BaseButton
        variant="primary"
        icon="aktion-hinzufuegen"
        type="submit"
        form="create-campaign"
        :disabled="busy"
      >
        {{ t("campaigns.create.action") }}
      </BaseButton>
    </template>
  </ModalDialog>
</template>
