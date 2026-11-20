<script setup lang="ts">
/** Mobile top bar (< 768 px): menu, the Questaria logo, account; below it the campaign context. */
import { computed } from "vue";
import { useRoute } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import { roleMessageKey, useRuleset } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import { useHomePath } from "@/core/i18n/localizedRoutes";
import { useNavigation } from "@/core/navigation/navigation";
import { useShellStore } from "@/core/ui/shell";

import UserMenu from "./UserMenu.vue";

const { t } = useAppI18n();
const home = useHomePath();
const route = useRoute();
const shell = useShellStore();
const nav = useNavigation();
const campaign = computed(() => (route.meta.area === "campaign" ? nav.campaign.value : null));
const ruleset = useRuleset(() => campaign.value?.rulesetId);
/** The Questaria logo, white with the red wing on navy. */
const brandLogo = `${import.meta.env.BASE_URL}assets/brand/questaria-logo-hell.svg`;
</script>

<template>
  <header class="shrink-0 bg-navy-900 text-parchment md:hidden">
    <div class="flex h-14 items-center gap-2 px-2">
      <button
        type="button"
        class="flex size-11 items-center justify-center"
        :aria-label="t('common.shell.openMenu')"
        :aria-expanded="shell.mobileNavOpen"
        @click="shell.openMobileNav()"
      >
        <Icon
          name="aktion-menue"
          :size="26"
        />
      </button>
      <RouterLink
        :to="home"
        class="flex items-center gap-2"
        :aria-label="t('common.shell.toHome')"
      >
        <img
          :src="brandLogo"
          alt=""
          width="2227"
          height="682"
          class="h-8 w-auto"
        >
      </RouterLink>
      <div class="ml-auto">
        <UserMenu
          compact
          :switch-to="nav.viewSwitch.value"
        />
      </div>
    </div>
    <div
      v-if="campaign"
      class="grid grid-cols-2 gap-2 px-3 pb-3"
    >
      <button
        type="button"
        class="shell-chip col-span-2 text-[16px]"
        :aria-label="`${campaign.name} – ${t('common.shell.switchCampaign')}`"
        @click="shell.openMobileNav()"
      >
        <Icon
          name="nav-kampagne"
          :size="20"
          class="text-gold-light"
        /><span class="truncate">{{ campaign.name }}</span><Icon
          name="ui-chevron-down"
          :size="18"
          class="ml-auto"
        />
      </button>
      <span
        class="shell-chip min-w-0 text-[16px]"
        :title="t('common.shell.ruleset')"
      ><Icon
        name="orig-wuerfel"
        :size="20"
        class="shrink-0 text-gold-light"
      /><span class="truncate">{{ ruleset.data.value?.name }}</span></span>
      <span
        v-if="campaign.role"
        class="shell-chip min-w-0 text-[16px]"
        :title="t('common.shell.role')"
      ><Icon
        name="orig-krone"
        :size="20"
        class="shrink-0 text-gold-light"
      /><span class="truncate">{{ t(roleMessageKey(campaign.role)) }}</span></span>
    </div>
    <div
      v-else
      class="px-3 pb-3"
    >
      <span class="shell-chip w-full text-[16px]"><Icon
        name="nav-dashboard"
        :size="20"
        class="text-gold-light"
      />{{ t("common.nav.account") }}</span>
    </div>
  </header>
</template>
