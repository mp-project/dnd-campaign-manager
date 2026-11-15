<script setup lang="ts">
/** Way back under the breadcrumb ("Zur Nutzerliste"); `boxed` as a framed button. */
import type { RouteLocationRaw } from "vue-router";

import Icon from "@/components/base/Icon.vue";

defineProps<{ to: RouteLocationRaw; label: string; boxed?: boolean }>();
</script>

<template>
  <RouterLink
    :to="to"
    class="inline-flex min-h-11 items-center gap-2 text-[16px] text-brand hover:underline"
    :class="boxed && 'rounded-control border border-brand/40 bg-parchment-card px-4 hover:bg-parchment-sunk hover:no-underline'"
  >
    <Icon
      name="ui-chevron-left"
      :size="18"
    />{{ label }}
  </RouterLink>
</template>
