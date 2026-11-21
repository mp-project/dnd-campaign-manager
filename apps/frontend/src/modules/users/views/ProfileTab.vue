<script setup lang="ts">
/**
 * Profile: display name, language, time zone and reduced motion can be changed here; user tag and
 * email are shown (the email changes under sign-in & security, with a confirmation from the new
 * address). The profile's language and reduced motion apply right after saving.
 */
import { SUPPORTED_LOCALES } from "@dnd/i18n";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";

import Avatar from "@/components/base/Avatar.vue";
import Badge from "@/components/base/Badge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import SelectInput from "@/components/base/SelectInput.vue";
import TextInput from "@/components/base/TextInput.vue";
import ToggleSwitch from "@/components/base/ToggleSwitch.vue";
import type { Option } from "@/components/base/types";
import FormFooter from "@/components/page/FormFooter.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey } from "@/core/api/errors";
import { isDisplayName } from "@/core/auth/accountRules";
import { type Me, meQuery, useMe } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

import { updateProfile, updateSettings } from "../api";

const { t } = useAppI18n();
const queryClient = useQueryClient();
const me = useMe();

const form = reactive({ displayName: "", locale: "", timezone: "", reducedMotion: false });
const nameError = ref("");
const saved = ref(false);
const failure = ref("");
const busy = ref(false);

/** What the form was filled with; newer profile data only replaces untouched fields. */
let base = { ...form };

function valuesOf(profile: Me) {
  return {
    displayName: profile.displayName,
    locale: profile.settings.locale,
    timezone: profile.settings.timezone,
    reducedMotion: profile.settings.reducedMotion,
  };
}

function reset(profile: Me | undefined): void {
  if (!profile) return;
  base = valuesOf(profile);
  Object.assign(form, base);
  nameError.value = "";
}

watch(
  () => me.data.value,
  (profile) => {
    if (!profile) return;
    const next = valuesOf(profile);
    for (const key of Object.keys(next) as Array<keyof typeof next>) {
      if (form[key] === base[key]) (form as Record<typeof key, unknown>)[key] = next[key];
    }
    base = next;
  },
  { immediate: true },
);

const initials = computed(() =>
  form.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(""),
);

// i18n-dynamic: common.language.*
const languages = computed<Option[]>(() =>
  SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: t(`common.language.${locale}` as MessageKey) })),
);
const timezones = computed<Option[]>(() => {
  const zones = Intl.supportedValuesOf("timeZone");
  // A stored zone the browser doesn't list stays selectable.
  const all = form.timezone && !zones.includes(form.timezone) ? [form.timezone, ...zones] : zones;
  return all.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
});

async function save(): Promise<void> {
  const profile = me.data.value;
  if (!profile) return;
  saved.value = false;
  failure.value = "";
  const displayName = form.displayName.trim();
  nameError.value = isDisplayName(displayName) ? "" : t("users.profile.displayNameRequired");
  if (nameError.value) return;

  busy.value = true;
  try {
    const settings = {
      ...(form.locale !== profile.settings.locale ? { locale: form.locale } : {}),
      ...(form.timezone !== profile.settings.timezone ? { timezone: form.timezone } : {}),
      ...(form.reducedMotion !== profile.settings.reducedMotion ? { reducedMotion: form.reducedMotion } : {}),
    };
    // Each answer is kept at once, so a failing second request doesn't hide what the first saved.
    // The profile watcher applies language, time zone and reduced motion from here.
    if (displayName !== profile.displayName) {
      queryClient.setQueryData(meQuery.queryKey, await updateProfile({ displayName }));
    }
    if (Object.keys(settings).length > 0) {
      queryClient.setQueryData(meQuery.queryKey, await updateSettings(settings));
    }
    saved.value = true;
  } catch (error) {
    failure.value = t(errorMessageKey(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form
    v-if="me.data.value"
    novalidate
    @submit.prevent="save"
  >
    <section
      class="card p-4 md:grid md:grid-cols-[15rem_1fr] md:p-5"
      :aria-label="t('users.profile.title')"
    >
      <div class="flex flex-col gap-4 border-b border-line pb-4 md:border-r md:border-b-0 md:pr-5 md:pb-0">
        <h2 class="section-title hidden text-brand md:block">
          {{ t("users.profile.title") }}
        </h2>
        <div class="flex justify-center">
          <Avatar
            :initials="initials"
            :size="112"
          />
        </div>
        <div class="md:border-t md:border-line md:pt-4">
          <h3 class="section-title mb-2 text-[17px]! text-brand">
            {{ t("users.profile.previewTitle") }}
          </h3>
          <div class="flex items-center gap-3 rounded-card border border-line bg-parchment-card p-3">
            <Avatar
              :initials="initials"
              :size="48"
            />
            <span class="flex min-w-0 flex-col">
              <strong class="name-link truncate text-[18px] text-heading!">{{ form.displayName || "—" }}</strong>
              <span class="meta truncate">{{ me.data.value.userTag }}</span>
            </span>
          </div>
        </div>
        <InfoNote>{{ t("users.profile.previewHint") }}</InfoNote>
      </div>

      <div class="flex flex-col gap-4 pt-4 md:pt-0 md:pl-6">
        <FormField
          v-slot="field"
          :label="t('users.profile.displayName')"
          :hint="t('users.profile.displayNameHint')"
          :error="nameError"
          required
        >
          <TextInput
            :id="field.id"
            v-model="form.displayName"
            icon="ui-user"
            autocomplete="nickname"
            maxlength="120"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>
        <FormField
          v-slot="field"
          :label="t('users.profile.userTag')"
          :hint="t('users.profile.userTagHint')"
        >
          <TextInput
            :id="field.id"
            :model-value="me.data.value.userTag"
            icon="nav-benutzer"
            readonly
            :aria-describedby="field.describedby"
          />
        </FormField>
        <FormField
          v-slot="field"
          :label="t('users.profile.email')"
          :hint="t('users.profile.emailHint')"
        >
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="relative min-w-0 flex-1">
              <TextInput
                :id="field.id"
                :model-value="me.data.value.email"
                type="email"
                icon="ui-mail"
                readonly
                class="[&_input]:pr-36"
                :aria-describedby="field.describedby"
              />
              <Badge
                :tone="me.data.value.emailVerificationRequiredCode ? 'warn' : 'ok'"
                :icon="me.data.value.emailVerificationRequiredCode ? 'ui-alert' : 'ui-check'"
                class="absolute top-1/2 right-2 -translate-y-1/2"
              >
                {{ me.data.value.emailVerificationRequiredCode ? t("users.profile.unverified") : t("users.profile.verified") }}
              </Badge>
            </div>
            <BaseButton
              size="md"
              :to="{ name: 'account-security' }"
            >
              {{ t("users.profile.changeEmail") }}
            </BaseButton>
          </div>
        </FormField>
        <div class="grid gap-4 md:grid-cols-2">
          <FormField
            v-slot="field"
            :label="t('users.profile.language')"
          >
            <SelectInput
              :id="field.id"
              v-model="form.locale"
              :options="languages"
            />
          </FormField>
          <FormField
            v-slot="field"
            :label="t('users.profile.timezone')"
            :hint="t('users.profile.timezoneHint')"
          >
            <SelectInput
              :id="field.id"
              v-model="form.timezone"
              :options="timezones"
              :aria-describedby="field.describedby"
            />
          </FormField>
        </div>
        <ToggleSwitch
          v-model="form.reducedMotion"
          :label="t('users.profile.reducedMotion')"
          :description="t('users.profile.reducedMotionHint')"
          class="border-t border-line pt-4"
        />
      </div>
    </section>

    <div class="mt-4 flex flex-col gap-2">
      <InfoNote
        v-if="saved"
        tone="ok"
        announce
      >
        {{ t("users.profile.saved") }}
      </InfoNote>
      <InfoNote
        v-if="failure"
        tone="danger"
        announce
      >
        {{ failure }}
      </InfoNote>
    </div>
    <FormFooter
      :save-label="t('users.profile.save')"
      :busy="busy"
      @save="save"
      @discard="reset(me.data.value); saved = false; failure = ''"
    />
  </form>
  <p
    v-else-if="me.isPending.value"
    class="text-ink-2"
  >
    {{ t("common.states.loading") }}
  </p>
  <InfoNote
    v-else
    tone="danger"
  >
    {{ t(errorMessageKey(me.error.value)) }}
  </InfoNote>
</template>
