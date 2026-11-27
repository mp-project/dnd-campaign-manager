<script setup lang="ts">
/** Content card with domain icon, title and golden rule ("Kampagnenprofil"); slot `header-actions` on the right. */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

withDefaults(defineProps<{ title?: string; subtitle?: string; icon?: IconName; padded?: boolean }>(), {
  title: undefined,
  subtitle: undefined,
  icon: undefined,
  padded: true,
});
defineSlots<{ default(): unknown; "header-actions"?(): unknown }>();
</script>

<template>
  <section
    class="card"
    :class="padded && 'p-4 md:p-5'"
  >
    <header
      v-if="title"
      class="mb-4 flex items-center gap-3 border-b border-gold/60 pb-3"
    >
      <Icon
        v-if="icon"
        :name="icon"
        :size="28"
        class="shrink-0 text-ink"
      />
      <div class="min-w-0 flex-1">
        <h2 class="section-title">
          {{ title }}
        </h2>
        <p
          v-if="subtitle"
          class="text-[0.9375rem] text-ink-2"
        >
          {{ subtitle }}
        </p>
      </div>
      <slot name="header-actions" />
    </header>
    <slot />
  </section>
</template>
