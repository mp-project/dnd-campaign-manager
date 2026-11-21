<script setup lang="ts" generic="T extends string | number">
/**
 * Native select in the Questaria style. class/style go to the wrapper, other attributes to the select.
 * `placeholder` adds a disabled empty first option.
 */
import { computed, useAttrs } from "vue";

import { withoutClassAndStyle } from "@/core/ui/attrs";

import Icon from "./Icon.vue";
import type { IconName } from "./iconNames";
import type { Option } from "./types";

defineOptions({ inheritAttrs: false });
const model = defineModel<T | "">();
withDefaults(
  defineProps<{ id?: string; options?: Option<T>[]; placeholder?: string; invalid?: boolean; icon?: IconName }>(),
  { options: () => [] },
);
const attrs = useAttrs();
const selectAttrs = computed(() => withoutClassAndStyle(attrs));
</script>

<template>
  <div
    class="relative"
    :class="attrs.class"
    :style="attrs.style as string"
  >
    <Icon
      v-if="icon"
      :name="icon"
      :size="20"
      class="pointer-events-none absolute top-1/2 left-3 z-1 -translate-y-1/2 text-ink-2"
    />
    <select
      :id="id"
      v-model="model"
      v-bind="selectAttrs"
      class="input"
      :class="[model === '' && placeholder ? 'text-ink-3' : '', icon && 'pl-11']"
      :aria-invalid="invalid || undefined"
    >
      <option
        v-if="placeholder"
        value=""
        disabled
      >
        {{ placeholder }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>
