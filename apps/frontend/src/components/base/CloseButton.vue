<script setup lang="ts">
/** Close button for dialogs, panels and search fields; `label` says what closes ("Editor schließen"). */
import { useAppI18n } from "@/core/i18n";

import IconButton from "./IconButton.vue";
import type { ButtonSize } from "./types";

withDefaults(defineProps<{ label?: string; size?: ButtonSize; iconSize?: number }>(), { size: "lg" });
const { t } = useAppI18n();
</script>

<template>
  <IconButton
    icon="aktion-schliessen"
    :label="label ?? t('common.actions.close')"
    :size="size"
    :icon-size="iconSize"
  />
</template>
