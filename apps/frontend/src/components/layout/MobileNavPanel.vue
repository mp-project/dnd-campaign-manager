<script setup lang="ts">
/**
 * The whole navigation as a side panel on mobile; the menu button and "more"/"content" in the
 * bottom bar open it. Focus moves into the panel and back to the trigger; Esc closes it.
 */
import { nextTick, ref, watch } from "vue";

import CloseButton from "@/components/base/CloseButton.vue";
import { useAppI18n } from "@/core/i18n";
import { useShellStore } from "@/core/ui/shell";

import NavFooter from "./NavFooter.vue";
import ShellNavigation from "./ShellNavigation.vue";

const { t } = useAppI18n();
const shell = useShellStore();
const panel = ref<HTMLElement>();
const navigation = ref<InstanceType<typeof ShellNavigation>>();
let trigger: HTMLElement | null = null;

watch(
  () => shell.mobileNavOpen,
  async (open) => {
    if (!open) {
      trigger?.focus();
      return;
    }
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    if (shell.mobileNavFocus === "content") {
      navigation.value?.openGroups(["world", "adventure", "compendium"]);
      await nextTick();
      panel.value?.querySelector("#nav-group-world")?.scrollIntoView({ block: "start" });
    }
    panel.value?.querySelector<HTMLElement>("button, a")?.focus();
  },
);
/** The Questaria logo, white with the red wing on navy. */
const brandLogo = `${import.meta.env.BASE_URL}assets/brand/questaria-logo-hell.svg`;
</script>

<template>
  <Transition name="fade">
    <div
      v-if="shell.mobileNavOpen"
      class="fixed inset-0 z-50 bg-navy-950/60 md:hidden"
      @click="shell.closeMobileNav()"
    />
  </Transition>
  <Transition name="slide-left">
    <div
      v-if="shell.mobileNavOpen"
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('common.shell.menu')"
      class="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-90 flex-col bg-navy-950 md:hidden"
      @keydown.esc="shell.closeMobileNav()"
    >
      <div class="flex h-16 shrink-0 items-center gap-2 border-b border-navy-line px-4 text-parchment">
        <img
          :src="brandLogo"
          :alt="t('common.app.name')"
          width="2227"
          height="682"
          class="h-9 w-auto"
        >
        <CloseButton
          class="ml-auto text-parchment"
          :label="t('common.shell.closeMenu')"
          @click="shell.closeMobileNav()"
        />
      </div>
      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto py-2">
        <ShellNavigation
          ref="navigation"
          campaign-card
          @navigate="shell.closeMobileNav()"
        />
        <NavFooter />
      </div>
    </div>
  </Transition>
</template>
