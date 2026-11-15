<script setup lang="ts">
/**
 * The player view of a campaign: the same sidebar as the app with only what players see, a narrow
 * top bar (campaign, ruleset, role, account) and on mobile a bottom bar with the player targets.
 * `#player-dock` holds the character bar (pages teleport it there); it sits above the bottom bar
 * instead of floating over the content.
 */
import { ref, watch } from "vue";
import { useRoute } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import IconButton from "@/components/base/IconButton.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import BottomNav from "@/components/layout/BottomNav.vue";
import MobileNavPanel from "@/components/layout/MobileNavPanel.vue";
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import UserMenu from "@/components/layout/UserMenu.vue";
import { roleMessageKey, useRuleset } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useNavigation } from "@/core/navigation/navigation";
import { useShellStore } from "@/core/ui/shell";

const { t } = useAppI18n();
const route = useRoute();
const shell = useShellStore();
const nav = useNavigation();
const campaign = nav.campaign;
const ruleset = useRuleset(() => campaign.value?.rulesetId);

const scroller = ref<HTMLElement>();
watch(
  () => route.path,
  () => scroller.value?.scrollTo(0, 0),
);
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-navy-950">
    <AppSidebar :header-height="64" />
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="shrink-0 border-b border-navy-line bg-navy-900 text-parchment">
        <div class="flex h-14 items-center gap-3 px-3 md:h-16 md:px-5">
          <IconButton
            size="md"
            icon="aktion-menue"
            :icon-size="24"
            :label="t('common.shell.openMenu')"
            class="text-parchment md:hidden"
            @click="shell.openMobileNav()"
          />
          <template v-if="campaign">
            <span class="flex min-w-0 items-center gap-2 text-[16px] md:text-[18px]">
              <Icon
                name="nav-kampagne"
                :size="20"
                class="hidden text-gold-light md:block"
              /><span class="truncate">{{ campaign.name }}</span>
            </span>
            <span
              v-if="ruleset.data.value"
              class="hidden rounded-full border border-gold-light/60 px-3 py-0.5 text-[13px] text-gold-light lg:inline"
              :title="t('common.shell.ruleset')"
            >{{ ruleset.data.value.name }}</span>
            <span
              v-if="campaign.role"
              class="hidden rounded-full border border-gold-light/60 px-3 py-0.5 text-[13px] text-gold-light sm:inline"
              :title="t('common.shell.role')"
            >{{ t(roleMessageKey(campaign.role)) }}</span>
          </template>
          <div class="ml-auto">
            <UserMenu
              compact
              :switch-to="nav.viewSwitch.value"
            />
          </div>
        </div>
      </header>

      <div class="relative flex min-h-0 flex-1 flex-col">
        <main
          id="main"
          ref="scroller"
          class="scroll-thin-light min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-backdrop p-1.5 md:p-1"
        >
          <ParchmentFrame
            class="min-h-full"
            :class="!route.meta.fullBleed && 'px-4 pt-4 pb-6 md:px-8 md:pt-6 md:pb-8'"
          >
            <RouterView />
          </ParchmentFrame>
        </main>
        <div
          id="overlay-host"
          class="pointer-events-none absolute inset-0 z-30 *:pointer-events-auto"
        />
      </div>

      <div
        id="player-dock"
        class="shrink-0 bg-backdrop empty:hidden"
      />

      <BottomNav
        v-if="nav.playerBottom.value.length > 1"
        :targets="nav.playerBottom.value"
        :active="nav.activeId.value"
        :label="t('common.shell.playerNavigation')"
      />
    </div>
    <MobileNavPanel />
  </div>
</template>
