<script setup lang="ts">
/**
 * The navigation tree of sidebar and mobile menu: the account's entries, then the campaign's.
 * Active entry: burgundy surface, golden marker, aria-current="page". Groups (world, adventure,
 * compendium) collapse; the group of the current page is always open. `compact` shows symbols
 * only (collapsed sidebar), the labels stay for screen readers.
 */
import { reactive, watch } from "vue";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import type { NavEntry, NavGroupId, NavLink } from "@/core/navigation/navigation";

const props = defineProps<{
  account: NavLink[];
  campaign: NavEntry[];
  activeId?: string;
  activeGroup?: NavGroupId | null;
  compact?: boolean;
}>();
const emit = defineEmits<{ navigate: [] }>();
defineSlots<{
  /** Above the campaign's entries (campaign card or switcher). */
  campaign?(): unknown;
  /** Instead of the campaign's entries when there are none (no campaign chosen). */
  "campaign-empty"?(): unknown;
}>();

const { t } = useAppI18n();
const open = reactive<Record<NavGroupId, boolean>>({ world: false, adventure: false, compendium: false });

watch(
  () => props.activeGroup,
  (group) => {
    if (group) open[group] = true;
  },
  { immediate: true },
);

/** Opens groups from outside (mobile "content" opens all of them). */
function openGroups(groups: NavGroupId[]): void {
  for (const group of groups) open[group] = true;
}
defineExpose({ openGroups });

const current = (id: string) => (props.activeId === id ? "page" : undefined);
</script>

<template>
  <nav
    :aria-label="t('common.shell.mainNavigation')"
    class="text-[16.5px] text-parchment"
    :class="compact && 'nav-compact'"
  >
    <template v-if="account.length > 0">
      <p
        v-if="!compact"
        class="eyebrow mb-1 px-6 pt-2 text-gold-light"
      >
        {{ t("common.nav.account") }}
      </p>
      <ul>
        <li
          v-for="link in account"
          :key="link.id"
        >
          <RouterLink
            :to="link.to"
            :title="compact ? link.label : undefined"
            class="nav-item"
            :class="activeId === link.id && 'is-active'"
            :aria-current="current(link.id)"
            @click="emit('navigate')"
          >
            <Icon
              :name="link.icon"
              :size="24"
            /><span class="nav-label">{{ link.label }}</span>
          </RouterLink>
        </li>
      </ul>
      <div class="mx-5 my-3 border-t border-navy-line" />
    </template>

    <p
      v-if="!compact"
      class="eyebrow mb-1 px-6 text-gold-light"
    >
      {{ t("common.nav.campaign") }}
    </p>
    <slot name="campaign" />
    <ul v-if="campaign.length > 0">
      <template
        v-for="entry in campaign"
        :key="entry.kind === 'link' ? entry.link.id : entry.id"
      >
        <li
          v-if="entry.kind === 'divider'"
          class="mx-5 my-3 border-t border-navy-line"
          role="separator"
        />
        <li
          v-else-if="entry.kind === 'group'"
          :id="`nav-group-${entry.id}`"
        >
          <button
            type="button"
            class="nav-item w-full"
            :class="activeGroup === entry.id && 'text-gold-light'"
            :aria-expanded="open[entry.id]"
            @click="open[entry.id] = !open[entry.id]"
          >
            <Icon
              :name="entry.icon"
              :size="24"
            /><span class="nav-label">{{ entry.label }}</span>
            <Icon
              v-if="!compact"
              :name="open[entry.id] ? 'ui-chevron-up' : 'ui-chevron-right'"
              :size="18"
              class="ml-auto"
            />
          </button>
          <ul v-show="open[entry.id] || compact">
            <li
              v-for="link in entry.links"
              :key="link.id"
            >
              <RouterLink
                :to="link.to"
                :title="compact ? link.label : undefined"
                class="nav-item nav-sub"
                :class="activeId === link.id && 'is-active'"
                :aria-current="current(link.id)"
                @click="emit('navigate')"
              >
                <Icon
                  :name="link.icon"
                  :size="20"
                /><span class="nav-label">{{ link.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </li>
        <li v-else>
          <RouterLink
            :to="entry.link.to"
            :title="compact ? entry.link.label : undefined"
            class="nav-item"
            :class="activeId === entry.link.id && 'is-active'"
            :aria-current="current(entry.link.id)"
            @click="emit('navigate')"
          >
            <Icon
              :name="entry.link.icon"
              :size="24"
            /><span class="nav-label">{{ entry.link.label }}</span>
          </RouterLink>
        </li>
      </template>
    </ul>
    <slot
      v-else
      name="campaign-empty"
    />
  </nav>
</template>
