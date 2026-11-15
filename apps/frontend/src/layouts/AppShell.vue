<script setup lang="ts">
/**
 * Shell of the account pages and of the campaign area (game master, editors).
 * Desktop: sidebar 276 px, top bar 76 px, parchment work surface scrolling on its own.
 * Mobile (< 768 px): top bar with the campaign context, content, bottom bar in a campaign.
 * Drawers and mobile editor pages teleport to `#overlay-host` above the work surface.
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";

import AppSidebar from "@/components/layout/AppSidebar.vue";
import AppTopbar from "@/components/layout/AppTopbar.vue";
import BottomNav from "@/components/layout/BottomNav.vue";
import MobileHeader from "@/components/layout/MobileHeader.vue";
import MobileNavPanel from "@/components/layout/MobileNavPanel.vue";
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import { useAppI18n } from "@/core/i18n";
import { useNavigation } from "@/core/navigation/navigation";
import { useShellStore } from "@/core/ui/shell";

const { t } = useAppI18n();
const route = useRoute();
const shell = useShellStore();
const nav = useNavigation();
const inCampaign = computed(() => route.meta.area === "campaign");

const activeBottom = computed(() => {
  const id = nav.activeId.value;
  if (nav.campaignBottom.value.some((target) => target.id === id)) return id;
  return nav.activeGroup.value ? "content" : "more";
});

const scroller = ref<HTMLElement>();
watch(
  () => route.path,
  () => scroller.value?.scrollTo(0, 0),
);
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-navy-950">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar />
      <MobileHeader />
      <div class="relative min-h-0 flex-1">
        <main
          id="main"
          ref="scroller"
          class="scroll-thin-light absolute inset-0 overflow-x-hidden overflow-y-auto bg-backdrop p-1.5 md:p-1"
        >
          <ParchmentFrame
            class="min-h-full"
            :class="!route.meta.fullBleed && 'px-4 pt-4 pb-6 md:px-8 md:pt-5 md:pb-8'"
          >
            <RouterView />
          </ParchmentFrame>
        </main>
        <!-- Drawers and mobile editor pages lie above the work surface; header and navigation stay visible. -->
        <div
          id="overlay-host"
          class="pointer-events-none absolute inset-0 z-30 *:pointer-events-auto"
        />
      </div>
      <BottomNav
        v-if="inCampaign && nav.campaignBottom.value.length > 0"
        :targets="nav.campaignBottom.value"
        :active="activeBottom"
        :label="t('common.shell.campaignNavigation')"
        compass-first
        @panel="(panel) => shell.openMobileNav(panel === 'content' ? 'content' : null)"
      />
    </div>
    <MobileNavPanel />
  </div>
</template>
