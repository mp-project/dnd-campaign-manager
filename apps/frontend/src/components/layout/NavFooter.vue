<script setup lang="ts">
/** End of the navigation: mountain motif (decorative), golden rule, the motto as real text. */
import { useAppI18n } from "@/core/i18n";

const { t } = useAppI18n();
</script>

<template>
  <div class="flex flex-col items-center px-6 pt-4 pb-6 text-center">
    <svg
      class="text-mist"
      width="200"
      height="66"
      viewBox="0 0 240 80"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 74 69 36 94 50 146 4 202 60 235 46"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M69 36 77 58 92 51M146 4 138 48 156 33 180 60"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M5 74 69 36 94 50 146 4 202 60 235 46 235 80H5Z"
        fill="currentColor"
        opacity=".14"
      />
    </svg>
    <span
      class="my-3 h-px w-12 bg-gold-light"
      aria-hidden="true"
    />
    <p class="font-serif text-[15px] leading-snug whitespace-pre-line text-parchment/90 italic">
      {{ t("common.shell.motto") }}
    </p>
  </div>
</template>
