<script setup lang="ts">
/**
 * Desktop sidebar. Collapses to a column of symbols (76 px), remembered per browser. `headerHeight`
 * matches the brand area to the shell's top bar (AppShell 76 px, PlayerShell 64 px).
 */
import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import { useHomePath } from "@/core/i18n/localizedRoutes";
import { useShellStore } from "@/core/ui/shell";

import BrandMark from "./BrandMark.vue";
import NavFooter from "./NavFooter.vue";
import ShellNavigation from "./ShellNavigation.vue";

withDefaults(defineProps<{ headerHeight?: number }>(), { headerHeight: 76 });
const { t } = useAppI18n();
const home = useHomePath();
/** The dragon Q alone, for the collapsed sidebar. */
const brandIcon = `${import.meta.env.BASE_URL}assets/brand/questaria-q-hell.svg`;
const shell = useShellStore();
</script>

<template>
  <aside
    class="hidden shrink-0 flex-col bg-navy-950 transition-[width] duration-200 md:flex"
    :class="shell.navCollapsed ? 'w-19' : 'w-69'"
    :aria-label="t('common.shell.sidebar')"
  >
    <div
      class="flex shrink-0 items-center border-b border-navy-line"
      :style="{ height: `${headerHeight}px` }"
      :class="shell.navCollapsed ? 'justify-center' : 'px-4'"
    >
      <RouterLink
        v-if="shell.navCollapsed"
        :to="home"
        :aria-label="t('common.shell.toHome')"
      >
        <img
          :src="brandIcon"
          alt=""
          width="40"
          height="40"
          class="size-10"
        >
      </RouterLink>
      <BrandMark
        v-else
        :compact="headerHeight < 70"
      />
    </div>
    <div class="scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-3">
      <ShellNavigation :compact="shell.navCollapsed" />
    </div>
    <div
      v-if="!shell.navCollapsed"
      class="shrink-0 border-t border-navy-line/50"
    >
      <NavFooter />
    </div>
    <button
      type="button"
      class="flex h-11 shrink-0 items-center gap-2 border-t border-navy-line text-[0.875rem] text-parchment/75 hover:bg-navy-800 hover:text-parchment"
      :class="shell.navCollapsed ? 'justify-center' : 'px-5'"
      :aria-expanded="!shell.navCollapsed"
      :title="shell.navCollapsed ? t('common.shell.expandNav') : t('common.shell.collapseNav')"
      @click="shell.toggleNavCollapsed()"
    >
      <Icon
        :name="shell.navCollapsed ? 'ui-chevron-right' : 'ui-chevron-left'"
        :size="18"
      />
      <span v-if="!shell.navCollapsed">{{ t("common.shell.collapse") }}</span>
      <span
        v-else
        class="sr-only"
      >{{ t("common.shell.expandNav") }}</span>
    </button>
  </aside>
</template>
