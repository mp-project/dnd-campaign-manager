<script setup lang="ts">
/** Introduction of a section within a page or tab: domain icon + title (burgundy) + subtitle. */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

defineProps<{ title: string; subtitle?: string; icon?: IconName }>();
</script>

<template>
  <div class="mb-4 md:mb-5">
    <h2 class="section-title flex items-center gap-3 text-brand">
      <Icon
        v-if="icon"
        :name="icon"
        :size="28"
        class="shrink-0 text-ink"
      />{{ title }}
    </h2>
    <p
      v-if="subtitle"
      class="mt-1 text-[16px] text-ink-2"
    >
      {{ subtitle }}
    </p>
  </div>
</template>
