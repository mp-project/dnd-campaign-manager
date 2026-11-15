import { reactive } from "vue";

import type { Option } from "@/components/base/types";

/**
 * The small editor for single values (character values, quantities, texts, visibility …). One
 * `<ValueEditor />` in App.vue shows it; any component opens it with `editValues(anchor, …)`.
 *
 *   editValues(anchor, {
 *     title: strengthLabel,
 *     fields: [{ key: "value", label: valueLabel, type: "number", value: 14, min: 1, max: 30 }],
 *     preview: (values) => modifierText(values.value),
 *     onSave: (values) => updateCharacter.mutateAsync({ strength: values.value }),
 *   });
 *
 * `onSave` runs the request. While it runs the editor is busy; if it fails, the editor stays open
 * and shows the translated error (also a 412 conflict).
 */

type FieldBase = { key: string; label: string; hint?: string; full?: boolean };

export type ValueField =
  | (FieldBase & { type: "number"; value?: number; min?: number; max?: number; step?: number; unit?: string; noStepper?: boolean })
  | (FieldBase & { type: "text" | "date" | "time"; value?: string; placeholder?: string; required?: boolean })
  | (FieldBase & { type: "textarea"; value?: string; placeholder?: string; required?: boolean; rows?: number })
  | (FieldBase & { type: "select"; value?: string; options: Option[] })
  | (FieldBase & { type: "toggle"; value?: boolean });

export type ValueMap = Record<string, string | number | boolean>;

export type ValueEditorRequest = {
  title: string;
  hint?: string;
  saveLabel?: string;
  fields: ValueField[];
  preview?: (values: ValueMap) => string;
  onSave: (values: ValueMap) => unknown;
};

export const valueEditor = reactive({
  open: false,
  /** Position of the element that opened the editor. */
  anchor: null as DOMRect | null,
  returnFocus: null as HTMLElement | null,
  title: "",
  hint: "",
  saveLabel: "",
  fields: [] as ValueField[],
  values: {} as ValueMap,
  preview: null as ValueEditorRequest["preview"] | null,
  onSave: null as ValueEditorRequest["onSave"] | null,
});

function initialValue(field: ValueField): string | number | boolean {
  if (field.value !== undefined) return field.value;
  if (field.type === "number") return field.min ?? 0;
  if (field.type === "toggle") return false;
  return "";
}

export function editValues(anchor: HTMLElement | null, request: ValueEditorRequest): void {
  valueEditor.anchor = anchor?.getBoundingClientRect() ?? null;
  valueEditor.returnFocus = anchor;
  valueEditor.title = request.title;
  valueEditor.hint = request.hint ?? "";
  valueEditor.saveLabel = request.saveLabel ?? "";
  valueEditor.fields = request.fields;
  valueEditor.values = Object.fromEntries(request.fields.map((field) => [field.key, initialValue(field)]));
  valueEditor.preview = request.preview ?? null;
  valueEditor.onSave = request.onSave;
  valueEditor.open = true;
}

export function closeValueEditor(): void {
  valueEditor.open = false;
  valueEditor.returnFocus?.focus?.();
}
