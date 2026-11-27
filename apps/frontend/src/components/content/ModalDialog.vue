<script setup lang="ts">
/**
 * Modal dialog (confirmations, taking content over …). Bottom sheet on mobile, centered on desktop.
 * Esc and a click on the backdrop close it; focus moves into the dialog and back afterwards.
 */
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

import CloseButton from "@/components/base/CloseButton.vue";

const open = defineModel<boolean>({ default: false });
withDefaults(defineProps<{ title: string; width?: string; closeLabel?: string }>(), { width: "560px" });
defineSlots<{ default(): unknown; footer?(): unknown }>();

const dialog = ref<HTMLElement>();
let returnFocus: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") open.value = false;
}

watch(open, async (isOpen) => {
  if (isOpen) {
    returnFocus = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKeydown);
    await nextTick();
    const field = dialog.value?.querySelector<HTMLElement>("input, select, textarea, [autofocus]");
    if (field) field.focus();
    else dialog.value?.focus();
  } else {
    document.removeEventListener("keydown", onKeydown);
    returnFocus?.focus?.();
  }
}, { immediate: true });

onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-70 flex items-end justify-center bg-navy-950/60 p-0 md:items-center md:p-6"
        @click.self="open = false"
      >
        <div
          ref="dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          class="parchment on-parchment frame-double max-h-[92dvh] w-full overflow-y-auto rounded-t-card p-5 md:rounded-card md:p-6"
          :style="{ maxWidth: width }"
        >
          <div class="mb-4 flex items-start gap-3">
            <h2 class="section-title flex-1 text-[1.5rem]!">{{ title }}</h2>
            <CloseButton
              :label="closeLabel"
              @click="open = false"
            />
          </div>
          <slot />
          <div
            v-if="$slots.footer"
            class="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-4 md:flex-row md:justify-between"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
