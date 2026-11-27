<script setup lang="ts">
/**
 * The global editor for single values (see `@/core/ui/valueEditor`). Desktop: a small popover at the
 * clicked value (below, above when there is no room). Mobile (< 768 px): a bottom sheet.
 * Enter saves, Esc or a click outside cancels. While saving it is busy; a failed save keeps it open
 * with the translated error.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { errorMessageKey } from "@/core/api/errors";
import { useAppI18n } from "@/core/i18n";
import { closeValueEditor, type ValueField, valueEditor as editor } from "@/core/ui/valueEditor";

import BaseButton from "./BaseButton.vue";
import Icon from "./Icon.vue";
import IconButton from "./IconButton.vue";

const { t } = useAppI18n();
const panel = ref<HTMLFormElement>();
const rect = ref<DOMRect | null>(null);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const tried = ref(false);
const saving = ref(false);
const saveError = ref("");

const mobile = computed(() => viewport.value.width < 768);
const wide = computed(() => editor.fields.some((field) => field.type === "textarea"));
const width = computed(() => (wide.value ? 440 : 340));

function measure(): void {
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
  rect.value = editor.returnFocus?.isConnected ? editor.returnFocus.getBoundingClientRect() : editor.anchor;
}

const style = computed(() => {
  if (mobile.value) return {};
  const { width: vw, height: vh } = viewport.value;
  const height = panel.value?.offsetHeight ?? 260;
  if (!rect.value) {
    return { left: `${(vw - width.value) / 2}px`, top: `${Math.max(12, (vh - height) / 2)}px`, width: `${width.value}px` };
  }
  const r = rect.value;
  const left = Math.min(Math.max(12, r.left + r.width / 2 - width.value / 2), vw - width.value - 12);
  const below = r.bottom + 8;
  const top =
    below + height > vh - 12 && r.top - height - 8 > 12 ? r.top - height - 8 : Math.min(below, Math.max(12, vh - height - 12));
  return { left: `${left}px`, top: `${top}px`, width: `${width.value}px` };
});

function fieldError(field: ValueField): string {
  const value = editor.values[field.key];
  if (field.type === "number") {
    if (value === "" || value == null || Number.isNaN(Number(value))) return t("common.valueEditor.number");
    if (field.min != null && Number(value) < field.min) return t("common.valueEditor.min", { min: field.min });
    if (field.max != null && Number(value) > field.max) return t("common.valueEditor.max", { max: field.max });
  }
  if ("required" in field && field.required && !String(value ?? "").trim()) return t("common.valueEditor.required");
  return "";
}

const errors = computed(() => Object.fromEntries(editor.fields.map((field) => [field.key, fieldError(field)])));
const valid = computed(() => Object.values(errors.value).every((error) => !error));

/** A preview that throws (bad input, missing data) shows nothing instead of breaking the editor. */
const previewText = computed(() => {
  if (!editor.preview || !valid.value) return "";
  try {
    return editor.preview(editor.values);
  } catch {
    return "";
  }
});

function step(field: Extract<ValueField, { type: "number" }>, direction: number): void {
  const current = Number(editor.values[field.key]) || 0;
  editor.values[field.key] = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, current + direction * (field.step ?? 1)));
}

async function save(): Promise<void> {
  tried.value = true;
  if (!valid.value || saving.value) return;
  const values = { ...editor.values };
  for (const field of editor.fields) {
    if (field.type === "number") values[field.key] = Number(values[field.key]);
  }

  saving.value = true;
  saveError.value = "";
  try {
    await editor.onSave?.(values);
    closeValueEditor();
  } catch (error) {
    saveError.value = t(errorMessageKey(error));
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (!saving.value) closeValueEditor();
}

function onKeydown(event: KeyboardEvent): void {
  if (!editor.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  }
  const target = event.target as HTMLElement | null;
  if (event.key === "Enter" && !event.shiftKey && target?.tagName !== "TEXTAREA" && panel.value?.contains(target)) {
    event.preventDefault();
    void save();
  }
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (editor.open && !saving.value && panel.value && !panel.value.contains(target) && !editor.returnFocus?.contains(target)) {
    editor.open = false;
  }
}

watch(
  () => editor.open,
  async (open) => {
    if (!open) return;
    tried.value = false;
    saveError.value = "";
    measure();
    await nextTick();
    measure(); // the panel's height is known now
    const first = panel.value?.querySelector<HTMLInputElement>("input:not([type=checkbox]), textarea, select");
    first?.focus();
    if (first?.tagName === "INPUT") first.select();
  },
);

onMounted(() => {
  window.addEventListener("resize", measure);
  document.addEventListener("scroll", measure, true);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("pointerdown", onPointerDown, true);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", measure);
  document.removeEventListener("scroll", measure, true);
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("pointerdown", onPointerDown, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="editor.open && mobile"
        class="fixed inset-0 z-74 bg-navy-950/50"
        aria-hidden="true"
      />
    </Transition>
    <Transition :name="mobile ? 'slide-up' : 'fade'">
      <form
        v-if="editor.open"
        ref="panel"
        role="dialog"
        :aria-label="t('common.valueEditor.dialog', { title: editor.title })"
        :aria-busy="saving || undefined"
        novalidate
        class="parchment on-parchment fixed z-75 flex flex-col gap-3 border border-gold p-4 shadow-drawer"
        :class="
          mobile
            ? 'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'max-h-[80vh] overflow-y-auto rounded-card'
        "
        :style="style"
        @submit.prevent="save"
      >
        <header class="flex items-start gap-2">
          <Icon
            name="aktion-bearbeiten"
            :size="20"
            class="mt-0.5 shrink-0 text-gold"
          />
          <div class="min-w-0 flex-1">
            <h2 class="font-heading text-[1.125rem] leading-snug font-bold text-heading">{{ editor.title }}</h2>
            <p
              v-if="editor.hint"
              class="meta text-[0.84375rem]! text-ink-2!"
            >
              {{ editor.hint }}
            </p>
          </div>
          <IconButton
            icon="aktion-schliessen"
            :icon-size="20"
            :label="t('common.actions.cancel')"
            class="-mt-2 -mr-2 shrink-0"
            @click="cancel"
          />
        </header>

        <fieldset
          :disabled="saving"
          class="grid gap-3"
          :class="editor.fields.length > 1 && !wide && 'grid-cols-2'"
        >
          <div
            v-for="field in editor.fields"
            :key="field.key"
            class="flex min-w-0 flex-col gap-1"
            :class="(field.full || field.type === 'textarea' || field.type === 'toggle' || editor.fields.length === 1) && 'col-span-2'"
          >
            <label
              v-if="field.type === 'toggle'"
              class="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-parchment-card px-3"
            >
              <input
                v-model="editor.values[field.key]"
                type="checkbox"
                class="size-5 accent-primary"
              >
              <span class="font-medium">{{ field.label }}</span>
            </label>
            <template v-else>
              <label
                :for="`ve-${field.key}`"
                class="label"
              >{{ field.label }}</label>
              <div
                v-if="field.type === 'number'"
                class="flex items-stretch"
              >
                <button
                  v-if="!field.noStepper"
                  type="button"
                  class="w-11 shrink-0 rounded-l-control border border-r-0 border-line-strong bg-parchment-sunk hover:bg-parchment disabled:opacity-40"
                  :disabled="field.min != null && Number(editor.values[field.key]) <= field.min"
                  :aria-label="t('common.stepper.decrease', { label: field.label })"
                  @click="step(field, -1)"
                >
                  <Icon
                    name="ui-minus"
                    :size="16"
                    class="mx-auto"
                  />
                </button>
                <input
                  :id="`ve-${field.key}`"
                  v-model.number="editor.values[field.key]"
                  type="number"
                  inputmode="numeric"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step ?? 1"
                  :aria-invalid="!!errors[field.key] || undefined"
                  class="input num min-w-0 [appearance:textfield] text-center font-heading text-[1.125rem] font-bold [&::-webkit-inner-spin-button]:appearance-none"
                  :class="field.noStepper ? (field.unit ? 'rounded-r-none!' : '') : 'rounded-none!'"
                >
                <button
                  v-if="!field.noStepper"
                  type="button"
                  class="w-11 shrink-0 border border-l-0 border-line-strong bg-parchment-sunk hover:bg-parchment disabled:opacity-40"
                  :class="!field.unit && 'rounded-r-control'"
                  :disabled="field.max != null && Number(editor.values[field.key]) >= field.max"
                  :aria-label="t('common.stepper.increase', { label: field.label })"
                  @click="step(field, 1)"
                >
                  <Icon
                    name="ui-plus"
                    :size="16"
                    class="mx-auto"
                  />
                </button>
                <span
                  v-if="field.unit"
                  class="flex items-center rounded-r-control border border-l-0 border-line-strong bg-parchment-sunk px-2.5 text-[0.875rem] text-ink-2"
                >{{ field.unit }}</span>
              </div>
              <select
                v-else-if="field.type === 'select'"
                :id="`ve-${field.key}`"
                v-model="editor.values[field.key]"
                class="input"
              >
                <option
                  v-for="option in field.options"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <textarea
                v-else-if="field.type === 'textarea'"
                :id="`ve-${field.key}`"
                v-model="editor.values[field.key] as string"
                :rows="field.rows ?? 5"
                :placeholder="field.placeholder"
                class="input"
              />
              <input
                v-else
                :id="`ve-${field.key}`"
                v-model="editor.values[field.key] as string"
                :type="field.type"
                :placeholder="field.placeholder"
                class="input"
                :aria-invalid="(tried && !!errors[field.key]) || undefined"
              >
              <p
                v-if="errors[field.key] && (tried || field.type === 'number')"
                class="flex items-center gap-1 text-[0.8125rem] text-danger"
              >
                <Icon
                  name="ui-alert"
                  :size="14"
                />{{ errors[field.key] }}
              </p>
              <p
                v-else-if="field.hint"
                class="meta"
              >
                {{ field.hint }}
              </p>
            </template>
          </div>
        </fieldset>

        <p
          v-if="previewText"
          class="num flex items-center gap-2 rounded-control bg-parchment-sunk px-3 py-2 text-[0.90625rem] text-info"
          aria-live="polite"
        >
          <Icon
            name="ui-sparkle"
            :size="16"
            class="shrink-0 text-gold"
          />{{ previewText }}
        </p>

        <p
          v-if="saveError"
          role="alert"
          class="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-[0.875rem] text-danger"
        >
          <Icon
            name="ui-alert"
            :size="16"
            class="shrink-0"
          />{{ saveError }}
        </p>

        <div class="flex flex-wrap gap-2 border-t border-line pt-3">
          <BaseButton
            class="min-w-0 grow"
            :disabled="saving"
            @click="cancel"
          >
            {{ t("common.actions.cancel") }}
          </BaseButton>
          <BaseButton
            variant="primary"
            icon="ui-check"
            :icon-size="18"
            class="min-w-0 grow-[1.4] whitespace-normal!"
            type="submit"
            :disabled="saving || (tried && !valid)"
          >
            {{ saving ? t("common.valueEditor.saving") : editor.saveLabel || t("common.valueEditor.apply") }}
          </BaseButton>
        </div>
      </form>
    </Transition>
  </Teleport>
</template>
