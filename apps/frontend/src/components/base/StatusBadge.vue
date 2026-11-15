<script setup lang="ts">
/**
 * Status from the one central mapping (`@/core/ui/status`): tone, icon and translated label.
 * The status is a code (`ACTIVE`, `DRAFT` …); an unknown code is shown neutral, never an error.
 */
import { computed } from "vue";

import { useAppI18n } from "@/core/i18n";
import { statusDefinition } from "@/core/ui/status";

import Badge from "./Badge.vue";

const props = withDefaults(defineProps<{ status: string; icon?: boolean; dot?: boolean }>(), { icon: true });
const { t } = useAppI18n();
const definition = computed(() => statusDefinition(props.status));
</script>

<template>
  <Badge
    :tone="definition.tone"
    :icon="icon && !dot ? definition.icon : undefined"
    :dot="dot"
  >
    {{ definition.known ? t(definition.labelKey) : status }}
  </Badge>
</template>
