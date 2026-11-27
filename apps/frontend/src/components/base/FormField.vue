<script setup lang="ts">
/**
 * Field wrapper: label outside the input, hint and error right at the field.
 * The slot gets `{ id, invalid, describedby }` for the aria wiring of the input.
 */
import { useId } from "vue";

import Icon from "./Icon.vue";

defineProps<{ label?: string; required?: boolean; hint?: string; error?: string; counter?: string; wide?: boolean }>();
defineSlots<{ default(props: { id: string; invalid: boolean; describedby: string | undefined }): unknown }>();
const id = useId();
</script>

<template>
  <div :class="['flex flex-col gap-1.5', { 'md:col-span-2': wide }]">
    <div
      v-if="label"
      class="flex items-baseline justify-between gap-2"
    >
      <label
        :for="id"
        class="label"
      >{{ label }}<span
        v-if="required"
        class="ml-1 text-brand"
        aria-hidden="true"
      >*</span></label>
      <span
        v-if="counter"
        class="meta num"
      >{{ counter }}</span>
    </div>
    <slot
      :id="id"
      :invalid="!!error"
      :describedby="error || hint ? `${id}-desc` : undefined"
    />
    <p
      v-if="error"
      :id="`${id}-desc`"
      class="flex items-center gap-1.5 text-[0.875rem] text-danger"
    >
      <Icon
        name="ui-alert"
        :size="16"
      />{{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="`${id}-desc`"
      class="meta"
    >
      {{ hint }}
    </p>
  </div>
</template>
