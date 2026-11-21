<script setup lang="ts">
/**
 * The place of a Clerk component on a page: loads Clerk (only here and in the app, never on the
 * other public pages), shows a quiet placeholder meanwhile and a note when sign-in is not
 * available (no key configured, Clerk not reachable). The slot renders once Clerk is ready, because
 * Clerk's components need the loaded instance. While prerendering, the placeholder is saved.
 */
import { onMounted, ref } from "vue";

import InfoNote from "@/components/page/InfoNote.vue";
import { isPrerendering, loadClerk } from "@/core/auth/clerk";
import { useAppI18n } from "@/core/i18n";

const { t } = useAppI18n();
const state = ref<"loading" | "ready" | "unavailable">("loading");

onMounted(async () => {
  const clerk = await loadClerk();
  if (clerk) state.value = "ready";
  else if (!isPrerendering()) state.value = "unavailable";
});
</script>

<template>
  <slot v-if="state === 'ready'" />
  <InfoNote
    v-else-if="state === 'unavailable'"
    tone="danger"
    announce
  >
    {{ t("common.signIn.unavailable") }}
  </InfoNote>
  <div
    v-else
    class="flex min-h-64 items-center justify-center text-ink-3"
    role="status"
  >
    {{ t("common.signIn.loading") }}
  </div>
</template>
