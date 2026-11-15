<script setup lang="ts">
/**
 * Signed-in devices: this one first; others can be signed out one by one or all at once
 * ("Überall abmelden" ends this session too and leads to the sign-in).
 */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { ref } from "vue";
import { useRouter } from "vue-router";

import Badge from "@/components/base/Badge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import { errorMessageKey } from "@/core/api/errors";
import { leave } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";

import { endSession } from "../api";
import { useDeviceName } from "../device";
import { sessionsQuery } from "../queries";

const { t } = useAppI18n();
const { date, relative } = useFormat();
const deviceName = useDeviceName();
const router = useRouter();
const queryClient = useQueryClient();
const sessions = useQuery(sessionsQuery);

const failure = ref("");
const busy = ref(false);

async function end(sessionId: string): Promise<void> {
  failure.value = "";
  busy.value = true;
  try {
    await endSession(sessionId);
    await queryClient.invalidateQueries({ queryKey: sessionsQuery.queryKey });
  } catch (error) {
    failure.value = t(errorMessageKey(error));
  } finally {
    busy.value = false;
  }
}

async function endAll(): Promise<void> {
  busy.value = true;
  await leave(queryClient, router, "everywhere");
}
</script>

<template>
  <SectionCard
    :title="t('users.sessions.title')"
    icon="ui-device"
  >
    <p
      v-if="sessions.isPending.value"
      class="text-ink-2"
    >
      {{ t("common.states.loading") }}
    </p>
    <InfoNote
      v-else-if="sessions.isError.value"
      tone="danger"
    >
      {{ t(errorMessageKey(sessions.error.value)) }}
    </InfoNote>
    <ul
      v-else
      class="flex flex-col divide-y divide-line"
    >
      <li
        v-for="session in sessions.data.value?.items"
        :key="session.id"
        class="flex flex-wrap items-center gap-3 py-2.5"
      >
        <Icon
          name="ui-device"
          :size="24"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="font-semibold">
            {{ deviceName(session.userAgent) }}
          </p>
          <p class="meta">
            {{ t("users.sessions.since", { date: date(session.startedAt) }) }} ·
            {{ t("users.sessions.lastActive", { when: relative(session.lastActiveAt) }) }}
          </p>
        </div>
        <Badge
          v-if="session.current"
          tone="ok"
        >
          {{ t("users.device.thisDevice") }}
        </Badge>
        <BaseButton
          v-else
          size="sm"
          variant="quiet"
          icon="aktion-abmelden"
          :disabled="busy"
          :aria-label="t('users.sessions.endLabel', { device: deviceName(session.userAgent) })"
          @click="end(session.id)"
        >
          {{ t("users.sessions.end") }}
        </BaseButton>
      </li>
    </ul>
    <p class="meta mt-2">
      {{ t("users.sessions.hint") }}
    </p>
    <BaseButton
      icon="aktion-abmelden"
      block
      class="mt-3"
      :disabled="busy"
      @click="endAll"
    >
      {{ t("users.sessions.endAll") }}
    </BaseButton>
    <InfoNote
      v-if="failure"
      class="mt-3"
      tone="danger"
      announce
    >
      {{ failure }}
    </InfoNote>
  </SectionCard>
</template>
