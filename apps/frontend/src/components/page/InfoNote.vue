<script setup lang="ts">
/**
 * A short note in the flow of a page: hint (`info`), success (`ok`), warning (`warn`) or error
 * (`danger`). `announce` reads it out when it appears (results of an action); danger then
 * interrupts, the others wait.
 */
import { computed } from "vue";

import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

type Tone = "info" | "ok" | "warn" | "danger";

const props = withDefaults(defineProps<{ tone?: Tone; icon?: IconName; announce?: boolean }>(), {
  tone: "info",
  icon: undefined,
});

const TONE_CLASS: Record<Tone, string> = {
  info: "bg-parchment-sunk text-ink-2",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};
const TONE_ICON: Record<Tone, IconName> = { info: "ui-info", ok: "ui-check-circle", warn: "ui-alert", danger: "ui-alert" };

const role = computed(() => (props.announce ? (props.tone === "danger" ? "alert" : "status") : undefined));
</script>

<template>
  <p
    :role="role"
    class="flex items-start gap-3 rounded-control px-4 py-3 text-[0.9375rem]"
    :class="TONE_CLASS[tone]"
  >
    <Icon
      :name="icon ?? TONE_ICON[tone]"
      :size="20"
      class="mt-0.5 shrink-0"
    />
    <span><slot /></span>
  </p>
</template>
