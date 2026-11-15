<script setup lang="ts">
/** Trusted devices: this browser first, each one removable; this browser can be trusted from here. */
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";

import Badge from "@/components/base/Badge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import { errorMessageKey } from "@/core/api/errors";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";

import { removeTrustedDevice, trustThisDevice } from "../api";
import { useDeviceName } from "../device";
import { trustedDevicesQuery } from "../queries";

const { t } = useAppI18n();
const { date, relative } = useFormat();
const deviceName = useDeviceName();
const queryClient = useQueryClient();
const devices = useQuery(trustedDevicesQuery);

const failure = ref("");
const busy = ref(false);
const thisTrusted = computed(() => devices.data.value?.items.some((device) => device.current) ?? false);

async function run(action: () => Promise<unknown>): Promise<void> {
  failure.value = "";
  busy.value = true;
  try {
    await action();
    await queryClient.invalidateQueries({ queryKey: trustedDevicesQuery.queryKey });
  } catch (error) {
    failure.value = t(errorMessageKey(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SectionCard
    :title="t('users.devices.title')"
    icon="ui-shield"
  >
    <p class="meta mb-3">
      {{ t("users.devices.hint") }}
    </p>
    <p
      v-if="devices.isPending.value"
      class="text-ink-2"
    >
      {{ t("common.states.loading") }}
    </p>
    <InfoNote
      v-else-if="devices.isError.value"
      tone="danger"
    >
      {{ t(errorMessageKey(devices.error.value)) }}
    </InfoNote>
    <template v-else>
      <p
        v-if="devices.data.value?.items.length === 0"
        class="text-ink-2"
      >
        {{ t("users.devices.empty") }}
      </p>
      <ul class="flex flex-col divide-y divide-line">
        <li
          v-for="device in devices.data.value?.items"
          :key="device.id"
          class="flex flex-wrap items-center gap-3 py-2.5"
        >
          <Icon
            name="ui-device"
            :size="24"
            class="shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              {{ deviceName(device.userAgent) }}
            </p>
            <p class="meta">
              {{ t("users.devices.since", { date: date(device.createdAt) }) }}<template v-if="device.lastUsedAt">
                · {{ t("users.devices.lastUsed", { when: relative(device.lastUsedAt) }) }}
              </template>
            </p>
          </div>
          <Badge
            v-if="device.current"
            tone="ok"
          >
            {{ t("users.device.thisDevice") }}
          </Badge>
          <BaseButton
            size="sm"
            variant="quiet"
            icon="aktion-loeschen"
            :disabled="busy"
            :aria-label="t('users.devices.removeLabel', { device: deviceName(device.userAgent) })"
            @click="run(() => removeTrustedDevice(device.id))"
          >
            {{ t("users.devices.remove") }}
          </BaseButton>
        </li>
      </ul>
      <BaseButton
        v-if="!thisTrusted"
        icon="ui-shield"
        block
        class="mt-3"
        :disabled="busy"
        @click="run(trustThisDevice)"
      >
        {{ t("users.devices.trustThis") }}
      </BaseButton>
    </template>
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
