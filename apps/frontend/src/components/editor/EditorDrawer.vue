<script setup lang="ts">
/**
 * Create and edit. The editor is a child route of its list (`…/neu`, `…/:id/bearbeiten`).
 * - Desktop: parchment drawer on the right over the dimmed list, section navigation on the left,
 *   head and action footer always in reach (discard left, the object-specific save right).
 * - Mobile: full-width editor page with section tabs in one scrolling line and the actions at
 *   the bottom.
 * `v-model` is the active section; the default slot gets `{ section }`. Saving is the page's:
 * `save` is emitted, the page sends the request (`busy` meanwhile) and closes on success.
 * Discard, the close button, Esc and a click on the backdrop close (`closeTo`, else back).
 * It slides in when it opens; closing leaves with the route, without a transition.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { type RouteLocationRaw, useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import CloseButton from "@/components/base/CloseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import StatusBadge from "@/components/base/StatusBadge.vue";
import WingSeal from "@/components/layout/WingSeal.vue";
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import { useAppI18n } from "@/core/i18n";

export type EditorSection = { id: string; label: string; mobileLabel?: string; icon?: IconName; description?: string };

const active = defineModel<string>();
const props = withDefaults(
  defineProps<{
    title: string;
    sections: EditorSection[];
    status?: string;
    icon?: IconName;
    saveLabel?: string;
    closeTo?: RouteLocationRaw;
    quote?: string;
    width?: string;
    busy?: boolean;
  }>(),
  { status: undefined, icon: undefined, saveLabel: undefined, closeTo: undefined, quote: undefined, width: "780px" },
);
const emit = defineEmits<{ save: [] }>();
defineSlots<{ default(props: { section: string | undefined }): unknown; "footer-extra"?(): unknown }>();
const { t } = useAppI18n();
const router = useRouter();

if (!active.value && props.sections.length > 0) active.value = props.sections[0]!.id;
const current = computed(() => props.sections.find((section) => section.id === active.value));

const dialog = ref<{ $el: HTMLElement }>();
const body = ref<HTMLElement>();
const strip = ref<HTMLElement>();
let returnFocus: HTMLElement | null = null;

watch(active, async () => {
  if (body.value) body.value.scrollTop = 0;
  await nextTick();
  strip.value?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ inline: "center", block: "nearest" });
});

function close(): void {
  if (props.closeTo) void router.push(props.closeTo);
  else router.back();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && !props.busy) close();
}

onMounted(async () => {
  returnFocus = document.activeElement as HTMLElement | null;
  document.addEventListener("keydown", onKeydown);
  await nextTick();
  dialog.value?.$el.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  returnFocus?.focus?.();
});
</script>

<template>
  <Teleport
    to="#overlay-host"
    defer
  >
    <div class="absolute inset-0 z-30 flex justify-end">
      <Transition
        name="fade"
        appear
      >
        <div
          class="absolute inset-0 hidden bg-navy-950/55 md:block"
          aria-hidden="true"
          @click="!busy && close()"
        />
      </Transition>
      <Transition
        name="slide-right"
        appear
      >
        <ParchmentFrame
          ref="dialog"
          tag="section"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          class="relative flex h-full w-full flex-col md:shadow-drawer"
          :style="{ maxWidth: `min(100%, ${width})` }"
        >
          <header class="mx-4 flex shrink-0 items-center gap-3 border-b border-gold/60 pt-4 pb-3 md:mx-6 md:gap-4 md:pt-5 md:pb-4">
            <WingSeal
              :size="62"
              tone="parchment"
              class="hidden md:block"
            />
            <Icon
              v-if="icon"
              :name="icon"
              :size="44"
              class="shrink-0 text-brand md:hidden"
            />
            <!-- Title and status below each other on mobile, so the title breaks between words. -->
            <div class="flex min-w-0 flex-1 flex-col items-start gap-1 md:flex-row md:flex-wrap md:items-center md:gap-x-4">
              <h2 class="page-title min-w-0 text-[1.375rem]! md:text-[clamp(1.625rem,2.6vw,2.375rem)]!">
                {{ title }}
              </h2>
              <StatusBadge
                v-if="status"
                :status="status"
                class="shrink-0"
              />
            </div>
            <CloseButton
              :icon-size="26"
              :label="t('common.editor.close')"
              class="ml-auto shrink-0"
              :disabled="busy"
              @click="close"
            />
          </header>

          <!-- Section tabs (mobile) -->
          <div
            v-if="sections.length > 1"
            class="mx-4 shrink-0 border-b border-line md:hidden"
          >
            <div
              ref="strip"
              role="tablist"
              :aria-label="t('common.editor.sections')"
              class="no-scrollbar flex gap-1 overflow-x-auto py-2.5"
            >
              <button
                v-for="section in sections"
                :key="section.id"
                type="button"
                role="tab"
                :aria-selected="active === section.id"
                class="min-h-11 shrink-0 rounded-control px-4 whitespace-nowrap"
                :class="active === section.id ? 'bg-primary text-parchment-card' : 'text-ink'"
                @click="active = section.id"
              >
                {{ section.mobileLabel ?? section.label }}
              </button>
            </div>
          </div>

          <div class="flex min-h-0 flex-1">
            <!-- Section navigation (desktop) -->
            <nav
              v-if="sections.length > 1"
              :aria-label="t('common.editor.sections')"
              class="scroll-thin-light hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line py-4 pl-4 md:flex"
            >
              <ul class="flex flex-col gap-1 pr-3">
                <li
                  v-for="section in sections"
                  :key="section.id"
                >
                  <button
                    type="button"
                    class="flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 py-1 text-left text-[0.96875rem] leading-tight"
                    :class="active === section.id ? 'bg-primary text-parchment-card shadow-primary' : 'text-ink hover:bg-parchment-sunk'"
                    :aria-current="active === section.id ? 'step' : undefined"
                    @click="active = section.id"
                  >
                    <Icon
                      :name="section.icon ?? 'ui-file'"
                      :size="22"
                      class="shrink-0"
                    /><span class="min-w-0 break-words">{{ section.label }}</span>
                  </button>
                </li>
              </ul>
              <!-- Only with enough height; otherwise it would touch the footer. -->
              <div
                v-if="quote"
                class="mt-auto hidden flex-col items-center px-3 pt-6 text-center [@media(min-height:880px)]:flex"
              >
                <p class="font-serif text-[0.9375rem] leading-snug text-ink italic">
                  {{ quote }}
                </p>
                <span class="mt-3 h-px w-10 bg-gold" />
              </div>
            </nav>

            <div
              ref="body"
              class="scroll-thin-light min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5"
            >
              <div
                v-if="current && sections.length > 1"
                class="mb-4 hidden md:block"
              >
                <h3 class="section-title text-[1.625rem]!">
                  {{ current.label }}
                </h3>
                <p
                  v-if="current.description"
                  class="text-ink-2"
                >
                  {{ current.description }}
                </p>
              </div>
              <slot :section="active" />
            </div>
          </div>

          <footer class="mx-4 flex shrink-0 items-stretch justify-between gap-3 border-t border-line py-3 md:mx-6 md:items-center md:py-4">
            <BaseButton
              class="shrink-0 md:min-w-36"
              :disabled="busy"
              @click="close"
            >
              {{ t("common.actions.discard") }}
            </BaseButton>
            <slot name="footer-extra" />
            <BaseButton
              variant="primary"
              icon="aktion-speichern"
              :icon-size="22"
              class="min-w-0 flex-1 md:flex-none"
              :disabled="busy"
              @click="emit('save')"
            >
              {{ saveLabel ?? t("common.actions.save") }}
            </BaseButton>
          </footer>
        </ParchmentFrame>
      </Transition>
    </div>
  </Teleport>
</template>
