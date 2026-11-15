<script setup lang="ts">
/**
 * Action menu ("more", "take over" …). The list is teleported to <body> and positioned fixed, so
 * containers with overflow-hidden never cut it; with too little room below it opens upwards.
 * An item's `action` gets the menu's root element (anchor for the value editor).
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { type RouteLocationRaw, useRouter } from "vue-router";

import { useAppI18n } from "@/core/i18n";

import Icon from "./Icon.vue";
import IconButton from "./IconButton.vue";
import type { IconName } from "./iconNames";

export type DropdownItem =
  | { divider: true }
  | { heading: string }
  | {
      label: string;
      icon?: IconName;
      to?: RouteLocationRaw;
      action?: (anchor: HTMLElement) => void;
      danger?: boolean;
      active?: boolean;
    };

const props = withDefaults(defineProps<{ items: DropdownItem[]; align?: "left" | "right"; label?: string; dark?: boolean }>(), {
  align: "right",
});
defineSlots<{ trigger?(props: { open: boolean; toggle: () => void }): unknown }>();

const { t } = useAppI18n();
const router = useRouter();
const open = ref(false);
const root = ref<HTMLElement>();
const menu = ref<HTMLElement>();
const position = ref<{ left?: string; top?: string }>({});

function toggle(): void {
  open.value = !open.value;
}

function pick(item: Extract<DropdownItem, { label: string }>): void {
  open.value = false;
  if (item.to) void router.push(item.to);
  if (root.value) item.action?.(root.value);
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (open.value && !root.value?.contains(target) && !menu.value?.contains(target)) open.value = false;
}

function place(): void {
  if (!open.value || !root.value) return;
  const rect = root.value.getBoundingClientRect();
  const height = menu.value?.offsetHeight ?? 220;
  const width = Math.max(menu.value?.offsetWidth ?? 224, 224);
  const upwards = rect.bottom + 4 + height > window.innerHeight - 8 && rect.top - 4 - height > 8;
  const left = Math.min(
    Math.max(8, props.align === "right" ? rect.right - width : rect.left),
    window.innerWidth - width - 8,
  );
  position.value = { left: `${left}px`, top: `${upwards ? rect.top - 4 - height : rect.bottom + 4}px` };
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  place();
  await nextTick();
  place();
  menu.value?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
});

function close(): void {
  if (!open.value) return;
  open.value = false;
  root.value?.querySelector<HTMLElement>("button")?.focus();
}

function moveFocus(step: number): void {
  const items = [...(menu.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  const current = items.indexOf(document.activeElement as HTMLElement);
  items[(current + step + items.length) % items.length]?.focus();
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  window.removeEventListener("resize", place);
  document.removeEventListener("scroll", place, true);
});
</script>

<template>
  <div
    ref="root"
    class="relative"
    @keydown.esc="close"
  >
    <slot
      name="trigger"
      :open="open"
      :toggle="toggle"
    >
      <IconButton
        icon="aktion-mehr"
        :label="label ?? t('common.menu.more')"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="toggle"
      />
    </slot>
    <Teleport to="body">
      <Transition name="fade">
        <ul
          v-if="open"
          ref="menu"
          role="menu"
          :style="position"
          class="fixed z-80 max-h-[70vh] min-w-56 overflow-y-auto rounded-card border py-1 shadow-soft"
          :class="dark ? 'border-navy-line bg-navy-900 text-parchment' : 'border-line bg-parchment-card text-ink'"
          @keydown.esc="close"
          @keydown.down.prevent="moveFocus(1)"
          @keydown.up.prevent="moveFocus(-1)"
        >
          <template
            v-for="(item, index) in items"
            :key="index"
          >
            <li
              v-if="'divider' in item"
              class="my-1 border-t"
              :class="dark ? 'border-navy-line' : 'border-line'"
              role="separator"
            />
            <li
              v-else-if="'heading' in item"
              class="eyebrow px-4 pt-2 pb-1 text-ink-3"
            >
              {{ item.heading }}
            </li>
            <li
              v-else
              role="none"
            >
              <button
                type="button"
                role="menuitem"
                class="flex min-h-11 w-full items-center gap-3 px-4 text-left"
                :class="[item.danger && 'text-danger', dark ? 'hover:bg-navy-800' : 'hover:bg-parchment-sunk']"
                @click="pick(item)"
              >
                <Icon
                  v-if="item.icon"
                  :name="item.icon"
                  :size="18"
                />{{ item.label }}
                <Icon
                  v-if="item.active"
                  name="ui-check"
                  :size="18"
                  class="ml-auto text-gold"
                />
              </button>
            </li>
          </template>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
