<script setup lang="ts">
/** Who sees content, as icon + text (`short` for narrow table cells). Mapping in `@/core/ui/visibility`. */
import { computed } from "vue";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { VISIBILITY, type Visibility } from "@/core/ui/visibility";

const props = withDefaults(defineProps<{ value: Visibility; short?: boolean; size?: number }>(), { size: 20 });
const { t } = useAppI18n();
const entry = computed(() => VISIBILITY[props.value]);
const text = computed(() => t(`common.visibility.${props.value}.${props.short ? "short" : "label"}` as MessageKey));
</script>

<template>
  <span
    class="inline-flex items-center gap-2"
    :class="short && 'whitespace-nowrap'"
  >
    <Icon
      :name="entry.icon"
      :size="size"
      :class="entry.textClass"
    />{{ text }}
  </span>
</template>
