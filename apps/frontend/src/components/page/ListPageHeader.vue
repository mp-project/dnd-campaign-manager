<script setup lang="ts">
/**
 * Head of a content list: PageHeader plus exactly one primary action ("… erstellen") and an
 * optional menu (e.g. "Übernehmen"). On mobile the menu becomes the more button and the primary
 * action a plus button. The caller decides what the viewer may do: without `createLabel` there is
 * no primary action, without `menuItems` no menu.
 * `createTo` leads to the editor route, otherwise `create` is emitted.
 * Slot `extra-actions`: more desktop actions left of the menu (e.g. a view switch).
 */
import type { RouteLocationRaw } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import IconButton from "@/components/base/IconButton.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";

import type { BreadcrumbItem } from "./AppBreadcrumb.vue";
import PageHeader from "./PageHeader.vue";

defineProps<{
  title: string;
  icon?: IconName;
  subtitle?: string;
  mobileSubtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  createLabel?: string;
  createTo?: RouteLocationRaw;
  menuLabel?: string;
  menuIcon?: IconName;
  menuItems?: DropdownItem[];
}>();
const emit = defineEmits<{ create: [] }>();
defineSlots<{ "extra-actions"?(): unknown }>();
const { t } = useAppI18n();
</script>

<template>
  <PageHeader
    :title="title"
    :icon="icon"
    :subtitle="subtitle"
    :mobile-subtitle="mobileSubtitle"
    :breadcrumb="breadcrumb"
  >
    <template #actions>
      <slot name="extra-actions" />
      <DropdownMenu
        v-if="menuItems?.length && menuLabel"
        :items="menuItems"
        :label="menuLabel"
      >
        <template #trigger="{ toggle, open }">
          <BaseButton
            :icon="menuIcon"
            icon-right="ui-chevron-down"
            :aria-expanded="open"
            @click="toggle"
          >
            {{ menuLabel }}
          </BaseButton>
        </template>
      </DropdownMenu>
      <template v-if="createLabel">
        <BaseButton
          v-if="createTo"
          variant="primary"
          icon="aktion-hinzufuegen"
          :to="createTo"
        >
          {{ createLabel }}
        </BaseButton>
        <BaseButton
          v-else
          variant="primary"
          icon="aktion-hinzufuegen"
          @click="emit('create')"
        >
          {{ createLabel }}
        </BaseButton>
      </template>
    </template>
    <template
      v-if="menuItems?.length || createLabel"
      #mobile-actions
    >
      <DropdownMenu
        v-if="menuItems?.length"
        :items="menuItems"
        :label="t('common.menu.more')"
      >
        <template #trigger="{ toggle, open }">
          <IconButton
            icon="aktion-mehr"
            :label="t('common.menu.more')"
            :aria-expanded="open"
            @click="toggle"
          />
        </template>
      </DropdownMenu>
      <template v-if="createLabel">
        <BaseButton
          v-if="createTo"
          variant="primary"
          icon="aktion-hinzufuegen"
          icon-only
          :label="createLabel"
          :to="createTo"
        />
        <BaseButton
          v-else
          variant="primary"
          icon="aktion-hinzufuegen"
          icon-only
          :label="createLabel"
          @click="emit('create')"
        />
      </template>
    </template>
  </PageHeader>
</template>
