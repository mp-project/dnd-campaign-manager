<script setup lang="ts">
/**
 * Appearance: the app's text size and whether the sidebar starts collapsed, saved to the account and
 * applied on every device right after saving (`app/profileSettings`). The preview shows the chosen
 * size before it is saved.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";

import RangeField from "@/components/base/RangeField.vue";
import ToggleSwitch from "@/components/base/ToggleSwitch.vue";
import FormFooter from "@/components/page/FormFooter.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { errorMessageKey } from "@/core/api/errors";
import { type Me, meQuery, useMe } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";
import { FONT_SCALE } from "@/core/ui/fontScale";

import { updateSettings } from "../api";

const { t } = useAppI18n();
const queryClient = useQueryClient();
const me = useMe();

const form = reactive({ fontScale: FONT_SCALE.default as number, sidebarCollapsed: false });
const saved = ref(false);
const failure = ref("");
const busy = ref(false);
/** What the form was filled with; newer profile data only replaces untouched fields. */
let base = { ...form };

function valuesOf(profile: Me) {
  return { fontScale: profile.settings.fontScale, sidebarCollapsed: profile.settings.sidebarCollapsed };
}

function reset(profile: Me | undefined): void {
  if (!profile) return;
  base = valuesOf(profile);
  Object.assign(form, base);
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

/** The page already shows the saved size, so the preview scales relative to it. */
const previewSize = computed(() => {
  const current = me.data.value?.settings.fontScale ?? FONT_SCALE.default;
  return `${form.fontScale / current}rem`;
});

async function save(): Promise<void> {
  const profile = me.data.value;
  if (!profile) return;
  saved.value = false;
  failure.value = "";

  const changes = {
    ...(form.fontScale !== profile.settings.fontScale ? { fontScale: form.fontScale } : {}),
    ...(form.sidebarCollapsed !== profile.settings.sidebarCollapsed ? { sidebarCollapsed: form.sidebarCollapsed } : {}),
  };

  busy.value = true;
  try {
    // The profile watcher applies text size and sidebar from here.
    if (Object.keys(changes).length > 0) {
      queryClient.setQueryData(meQuery.queryKey, await updateSettings(changes));
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
      :aria-label="t('users.appearance.title')"
    >
      <div class="flex flex-col gap-2 border-b border-line pb-4 md:border-r md:border-b-0 md:pr-5 md:pb-0">
        <h2 class="section-title hidden text-brand md:block">
          {{ t("users.appearance.title") }}
        </h2>
        <p class="text-ink-2">
          {{ t("users.appearance.intro") }}
        </p>
      </div>

      <div class="flex flex-col gap-4 pt-4 md:pt-0 md:pl-6">
        <div class="flex flex-col gap-2">
          <RangeField
            v-model="form.fontScale"
            :label="t('users.appearance.fontScale')"
            :min="FONT_SCALE.min"
            :max="FONT_SCALE.max"
            :step="FONT_SCALE.step"
          />
          <p class="text-ink-2">
            {{ t("users.appearance.fontScaleHint") }}
          </p>
          <figure class="rounded-card border border-line bg-parchment-card p-3">
            <figcaption class="meta mb-1">
              {{ t("users.appearance.previewTitle") }}
            </figcaption>
            <p
              class="text-ink"
              :style="{ fontSize: previewSize }"
            >
              {{ t("users.appearance.previewText") }}
            </p>
          </figure>
        </div>
        <ToggleSwitch
          v-model="form.sidebarCollapsed"
          :label="t('users.appearance.sidebarCollapsed')"
          :description="t('users.appearance.sidebarCollapsedHint')"
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
        {{ t("users.appearance.saved") }}
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
      :save-label="t('users.appearance.save')"
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
