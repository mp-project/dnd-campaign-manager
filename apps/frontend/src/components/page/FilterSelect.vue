<script setup lang="ts">
/**
 * Filter dropdown of a list head (type, access, tags …): several values as a checkbox list.
 * The button shows how many are chosen. Esc or a click outside closes it.
 */
import { onBeforeUnmount, onMounted, ref, useId } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { Option } from "@/components/base/types";

const model = defineModel<string[]>({ default: () => [] });
defineProps<{ label: string; options: Option[] }>();
const open = ref(false);
const root = ref<HTMLElement>();
const panelId = useId();

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));

function toggle(value: string): void {
  model.value = model.value.includes(value) ? model.value.filter((entry) => entry !== value) : [...model.value, value];
}
</script>

<template>
  <div
    ref="root"
    class="relative"
    @keydown.esc="open = false"
  >
    <BaseButton
      bare
      size="md"
      class="border-line-strong! font-normal!"
      :class="model.length > 0 && 'border-primary! bg-primary-soft/50'"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      {{ label }}
      <span
        v-if="model.length > 0"
        class="badge badge-burgundy px-2! py-0! text-[12px]"
      >{{ model.length }}</span>
      <Icon
        name="ui-chevron-down"
        :size="18"
      />
    </BaseButton>
    <div
      v-if="open"
      :id="panelId"
      role="group"
      :aria-label="label"
      class="absolute left-0 z-40 mt-1 min-w-56 rounded-card border border-line bg-parchment-card p-2 shadow-soft"
    >
      <label
        v-for="option in options"
        :key="option.value"
        class="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-parchment-sunk"
      >
        <input
          type="checkbox"
          :checked="model.includes(option.value)"
          :disabled="option.disabled"
          class="size-4 accent-primary"
          @change="toggle(option.value)"
        >{{ option.label }}
      </label>
    </div>
  </div>
</template>
