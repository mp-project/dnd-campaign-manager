<script setup lang="ts">
/** Unknown address, or content the account may not see (the API answers both with 404). */
import BaseButton from "@/components/base/BaseButton.vue";
import CompassRose from "@/components/layout/CompassRose.vue";
import { useAppI18n } from "@/core/i18n";

const { t } = useAppI18n();
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
    <CompassRose
      :size="64"
      tone="parchment"
    />
    <h1 class="page-title">
      {{ t("common.notFound.title") }}
    </h1>
    <p class="text-ink-2">
      {{ t("common.notFound.body") }}
    </p>
    <BaseButton
      variant="primary"
      icon="nav-dashboard"
      to="/dashboard"
      class="mt-2"
    >
      {{ t("common.notFound.back") }}
    </BaseButton>
  </main>
</template>
