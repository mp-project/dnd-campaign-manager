<script setup lang="ts">
/**
 * One-time code (e.g. activation): one box per digit. A pasted code is spread over the boxes,
 * Backspace on an empty box goes back. v-model is the array of digits.
 */
import { nextTick, ref } from "vue";

import { useAppI18n } from "@/core/i18n";

const digits = defineModel<string[]>({ default: () => ["", "", "", "", "", ""] });
defineProps<{ invalid?: boolean }>();
const { t } = useAppI18n();
const boxes = ref<HTMLInputElement[]>([]);

function focusBox(index: number): void {
  const box = boxes.value[Math.min(Math.max(index, 0), digits.value.length - 1)];
  box?.focus();
}

function onInput(index: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const { inputType, data } = event as InputEvent;
  // Typing into a filled box replaces its digit; only pasting or autofill spreads a whole code.
  const typed = inputType === "insertText" ? (data ?? "").replace(/\D/g, "").slice(-1) : null;
  const value = typed ?? input.value.replace(/\D/g, "");
  const next = [...digits.value];

  if (typed === null && value.length > 1) {
    // A pasted or autofilled code.
    value
      .slice(0, next.length - index)
      .split("")
      .forEach((digit, offset) => (next[index + offset] = digit));
    digits.value = next;
    void nextTick(() => focusBox(index + value.length));
    return;
  }

  next[index] = value;
  digits.value = next;
  input.value = value;
  if (value) focusBox(index + 1);
}

function onKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === "Backspace" && !digits.value[index] && index > 0) focusBox(index - 1);
}

function setBox(index: number, element: unknown): void {
  if (element instanceof HTMLInputElement) boxes.value[index] = element;
}
</script>

<template>
  <div
    class="grid gap-2 md:gap-3"
    :style="{ gridTemplateColumns: `repeat(${digits.length}, minmax(0, 1fr))` }"
  >
    <input
      v-for="(digit, index) in digits"
      :key="index"
      :ref="(element) => setBox(index, element)"
      :value="digit"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      :maxlength="digits.length"
      :aria-label="t('common.code.digit', { index: index + 1, total: digits.length })"
      :aria-invalid="(invalid && !digit) || undefined"
      class="input section-title num aspect-square min-h-12! px-0! text-center"
      @input="onInput(index, $event)"
      @keydown="onKeydown(index, $event)"
      @focus="($event.target as HTMLInputElement).select()"
    >
  </div>
</template>
