<script setup lang="ts">
/** Pill badge with a fixed semantic tone (classes `.badge-<tone>` in main.css). */
import Icon from "./Icon.vue";
import type { IconName } from "./iconNames";
import type { BadgeTone } from "./types";

withDefaults(defineProps<{ tone?: BadgeTone; icon?: IconName; dot?: boolean }>(), { tone: "neutral" });
</script>

<template>
  <span :class="['badge', `badge-${tone}`]">
    <span
      v-if="dot"
      class="size-2 rounded-full bg-current"
      aria-hidden="true"
    />
    <Icon
      v-if="icon"
      :name="icon"
      :size="14"
    />
    <slot />
  </span>
</template>
