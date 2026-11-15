import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import DropdownMenu from "@/components/base/DropdownMenu.vue";
import EditableValue from "@/components/base/EditableValue.vue";
import ValueEditor from "@/components/base/ValueEditor.vue";
import ModalDialog from "@/components/content/ModalDialog.vue";
import { ApiError } from "@/core/api/errors";
import { closeValueEditor, editValues, valueEditor } from "@/core/ui/valueEditor";

import { mountWithApp } from "../helpers/mount";

afterEach(() => {
  closeValueEditor();
  document.body.innerHTML = "";
});

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.body.querySelector<T>(selector);
const $$ = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)];

describe("dropdown menu", () => {
  it("opens, runs the action with its anchor and closes", async () => {
    const action = vi.fn();
    const { wrapper } = await mountWithApp(DropdownMenu, {
      props: { items: [{ heading: "Ort" }, { label: "Bearbeiten", icon: "aktion-bearbeiten", action }, { divider: true }, { label: "Löschen", danger: true }] },
    });

    expect(wrapper.find("button").attributes("aria-label")).toBe("Weitere Aktionen");
    await wrapper.find("button").trigger("click");
    await nextTick();
    expect($$("[role=menuitem]").map((item) => item.textContent?.trim())).toEqual(["Bearbeiten", "Löschen"]);

    $$("[role=menuitem]")[0]!.click();
    await nextTick();
    expect(action).toHaveBeenCalledWith(wrapper.element);
    expect($("[role=menu]")).toBeNull();
  });

  it("closes on Escape", async () => {
    const { wrapper } = await mountWithApp(DropdownMenu, { props: { items: [{ label: "Bearbeiten" }] } });
    await wrapper.find("button").trigger("click");
    await nextTick();

    $("[role=menu]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect($("[role=menu]")).toBeNull();
  });
});

describe("value editor", () => {
  async function openEditor(onSave: (values: Record<string, unknown>) => unknown) {
    const { wrapper } = await mountWithApp(defineComponent({ setup: () => () => h(ValueEditor) }));
    editValues(null, {
      title: "Stärke",
      fields: [{ key: "value", label: "Wert", type: "number", value: 14, min: 1, max: 30 }],
      preview: (values) => `Modifikator ${Math.floor((Number(values.value) - 10) / 2)}`,
      onSave,
    });
    await nextTick();
    await nextTick();
    return wrapper;
  }

  function submit(): void {
    $("form[role=dialog]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  it("validates bounds, previews and saves", async () => {
    const onSave = vi.fn();
    await openEditor(onSave);
    const input = $<HTMLInputElement>("#ve-value")!;

    expect($("form[role=dialog]")!.getAttribute("aria-label")).toBe("Stärke bearbeiten");
    expect(document.body.textContent).toContain("Modifikator 2");

    input.value = "31";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    expect(document.body.textContent).toContain("Höchstens 30.");
    submit();
    await flushPromises();
    expect(onSave).not.toHaveBeenCalled();

    input.value = "16";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    submit();
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith({ value: 16 });
    expect(valueEditor.open).toBe(false);
  });

  it("stays open with the translated error when saving fails", async () => {
    await openEditor(async () => {
      throw new ApiError({ status: 412, code: "VERSION_CONFLICT", message: "changed" });
    });

    submit();
    await flushPromises();

    expect(valueEditor.open).toBe(true);
    expect($("[role=alert]")!.textContent).toContain("Jemand anderes hat das inzwischen geändert.");
  });

  it("is busy while saving and ignores a second submit", async () => {
    let finish: () => void = () => undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await openEditor(onSave);

    submit();
    await nextTick();
    submit();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect($("form[role=dialog]")!.getAttribute("aria-busy")).toBe("true");
    expect(document.body.textContent).toContain("Wird gespeichert …");

    finish();
    await flushPromises();
    expect(valueEditor.open).toBe(false);
  });

  it("shows nothing for a preview that throws", async () => {
    await mountWithApp(defineComponent({ setup: () => () => h(ValueEditor) }));
    editValues(null, {
      title: "Name",
      fields: [{ key: "name", label: "Name", type: "text", value: "Rovan" }],
      preview: () => {
        throw new Error("no data");
      },
      onSave: () => undefined,
    });
    await nextTick();

    expect($("form[role=dialog]")).not.toBeNull();
    expect($(".text-info")).toBeNull();
  });

  it("is opened by an editable value with the value as anchor", async () => {
    const onEdit = vi.fn();
    const { wrapper } = await mountWithApp(EditableValue, { props: { label: "Stärke bearbeiten", onEdit }, slots: { default: "14" } });

    await wrapper.trigger("click");
    expect(onEdit).toHaveBeenCalledWith(wrapper.element);
  });
});

describe("modal dialog", () => {
  it("closes on Escape and on the close button", async () => {
    const open = ref(true);
    await mountWithApp(
      defineComponent({
        setup: () => () =>
          h(ModalDialog, { title: "Kampagne archivieren", modelValue: open.value, "onUpdate:modelValue": (value: boolean) => (open.value = value) }, () => "Sicher?"),
      }),
    );
    await nextTick();
    expect($("[role=dialog]")!.getAttribute("aria-label")).toBe("Kampagne archivieren");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(open.value).toBe(false);

    open.value = true;
    await nextTick();
    $<HTMLButtonElement>("[role=dialog] button[aria-label='Schließen']")!.click();
    expect(open.value).toBe(false);
  });
});
