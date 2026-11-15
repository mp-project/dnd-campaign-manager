<script setup lang="ts">
/** Icon-only button (edit, more, expand …). `label` is required: aria-label and tooltip. */
import BaseButton from "./BaseButton.vue";
import type { IconName } from "./iconNames";
import type { ButtonSize, ButtonVariant } from "./types";

withDefaults(
  defineProps<{ icon: IconName; label: string; variant?: ButtonVariant; size?: ButtonSize; iconSize?: number }>(),
  { variant: "ghost", size: "lg" },
);
</script>

<template>
  <BaseButton
    icon-only
    :icon="icon"
    :label="label"
    :variant="variant"
    :size="size"
    :icon-size="iconSize"
  />
</template>
