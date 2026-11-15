<script setup lang="ts">
/**
 * Single-line input, usually inside `<FormField v-slot="field">`.
 * - `icon` left, `suffix` text inside on the right, `unit` as a separate box on the right ("GM", "kg")
 * - slot `right`: a control inside the field (e.g. the password eye)
 * - class/style go to the wrapper, every other attribute (aria-*, autocomplete, inputmode …) to the input
 */
import { computed, useAttrs, useSlots } from "vue";

import { withoutClassAndStyle } from "@/core/ui/attrs";

import Icon from "./Icon.vue";
import type { IconName } from "./iconNames";

defineOptions({ inheritAttrs: false });
const model = defineModel<string | number | null>();
withDefaults(
  defineProps<{
    id?: string;
    placeholder?: string;
    icon?: IconName;
    type?: string;
    invalid?: boolean;
    readonly?: boolean;
    suffix?: string;
    unit?: string;
  }>(),
  { type: "text" },
);
defineSlots<{ right?(): unknown }>();
const attrs = useAttrs();
const slots = useSlots();
const inputAttrs = computed(() => withoutClassAndStyle(attrs));
</script>

<template>
  <div
    class="relative flex"
    :class="attrs.class"
    :style="attrs.style as string"
  >
    <div class="relative min-w-0 flex-1">
      <Icon
        v-if="icon"
        :name="icon"
        :size="20"
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2"
      />
      <input
        :id="id"
        v-model="model"
        v-bind="inputAttrs"
        :type="type"
        :placeholder="placeholder"
        :readonly="readonly"
        :aria-invalid="invalid || undefined"
        class="input"
        :class="[{ 'pl-11': icon, 'pr-14': suffix || slots.right, 'rounded-r-none': unit }, readonly && 'bg-parchment-sunk']"
      >
      <span
        v-if="suffix"
        class="meta pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      >{{ suffix }}</span>
      <div
        v-if="slots.right"
        class="absolute top-1/2 right-0.5 -translate-y-1/2"
      >
        <slot name="right" />
      </div>
    </div>
    <span
      v-if="unit"
      class="flex min-w-14 items-center justify-center rounded-r-control border border-l-0 border-line-strong bg-parchment-sunk px-3 text-ink-2"
    >{{ unit }}</span>
  </div>
</template>
