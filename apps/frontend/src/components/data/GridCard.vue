<script setup lang="ts">
/** Tile of the grid view of lists: domain icon or image, title (link with `to`), description. Slots: `badges`, default (facts), `actions`. */
import type { RouteLocationRaw } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

defineProps<{ title: string; description?: string; icon?: IconName; image?: string; to?: RouteLocationRaw }>();
defineSlots<{ default?(): unknown; badges?(): unknown; actions?(): unknown }>();
</script>

<template>
  <article class="card flex flex-col gap-3 p-4">
    <div class="flex items-start gap-3">
      <img
        v-if="image"
        :src="image"
        alt=""
        class="size-14 shrink-0 rounded-full border border-gold/60 object-cover"
      >
      <Icon
        v-else-if="icon"
        :name="icon"
        :size="36"
        class="shrink-0 text-earth"
      />
      <div class="min-w-0 flex-1">
        <RouterLink
          v-if="to"
          :to="to"
          class="name-link text-[18px] leading-tight hover:underline"
        >
          {{ title }}
        </RouterLink>
        <p
          v-else
          class="name-link text-[18px] leading-tight"
        >
          {{ title }}
        </p>
        <p
          v-if="description"
          class="mt-0.5 text-[14px] leading-snug text-ink-2"
        >
          {{ description }}
        </p>
      </div>
      <slot name="actions" />
    </div>
    <div
      v-if="$slots.badges"
      class="flex flex-wrap gap-1.5"
    >
      <slot name="badges" />
    </div>
    <div
      v-if="$slots.default"
      class="mt-auto border-t border-line pt-3 text-[14px]"
    >
      <slot />
    </div>
  </article>
</template>
