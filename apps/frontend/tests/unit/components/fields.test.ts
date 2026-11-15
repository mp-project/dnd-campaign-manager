import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import CodeInput from "@/components/base/CodeInput.vue";
import FormField from "@/components/base/FormField.vue";
import NumberStepper from "@/components/base/NumberStepper.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import SegmentedControl from "@/components/base/SegmentedControl.vue";
import TextInput from "@/components/base/TextInput.vue";
import ToggleSwitch from "@/components/base/ToggleSwitch.vue";

import { mountWithApp } from "../helpers/mount";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("form fields", () => {
  it("connects label, input and error through FormField", async () => {
    const Field = defineComponent({
      setup: () => () =>
        h(FormField, { label: "Name", error: "Bitte ausfüllen.", required: true }, {
          default: (field: { id: string; invalid: boolean; describedby?: string }) =>
            h(TextInput, { id: field.id, invalid: field.invalid, "aria-describedby": field.describedby }),
        }),
    });
    const { wrapper } = await mountWithApp(Field);
    const input = wrapper.find("input");

    expect(wrapper.find("label").attributes("for")).toBe(input.attributes("id"));
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(wrapper.find(`#${input.attributes("aria-describedby")}`).text()).toBe("Bitte ausfüllen.");
  });

  it("puts class on the wrapper and other attributes on the input", async () => {
    const { wrapper } = await mountWithApp(TextInput, {
      props: { unit: "kg" },
      attrs: { class: "w-40", autocomplete: "off", "aria-label": "Gewicht" },
    });

    expect(wrapper.classes()).toContain("w-40");
    expect(wrapper.find("input").attributes()).toMatchObject({ autocomplete: "off", "aria-label": "Gewicht" });
    expect(wrapper.find("input").classes()).not.toContain("w-40");
    expect(wrapper.text()).toContain("kg");
  });

  it("shows and hides the password", async () => {
    const { wrapper } = await mountWithApp(PasswordInput, { props: { modelValue: "geheim" } });
    const toggle = wrapper.find("button");

    expect(wrapper.find("input").attributes("type")).toBe("password");
    expect(toggle.attributes("aria-label")).toBe("Passwort anzeigen");
    await toggle.trigger("click");
    expect(wrapper.find("input").attributes("type")).toBe("text");
    expect(toggle.attributes("aria-label")).toBe("Passwort verbergen");
  });

  it("spreads a pasted code over the boxes", async () => {
    const digits = ref(["", "", "", "", "", ""]);
    const Code = defineComponent({
      setup: () => () => h(CodeInput, { modelValue: digits.value, "onUpdate:modelValue": (value: string[]) => (digits.value = value) }),
    });
    const { wrapper } = await mountWithApp(Code);
    const boxes = wrapper.findAll("input");

    await boxes[1]!.setValue("4821");
    expect(digits.value).toEqual(["", "4", "8", "2", "1", ""]);
    expect(boxes[0]!.attributes("aria-label")).toBe("Ziffer 1 von 6");
  });

  it("replaces the digit when typing into a filled box", async () => {
    const digits = ref(["3", "7", "", "", "", ""]);
    const Code = defineComponent({
      setup: () => () => h(CodeInput, { modelValue: digits.value, "onUpdate:modelValue": (value: string[]) => (digits.value = value) }),
    });
    const { wrapper } = await mountWithApp(Code);
    const box = wrapper.findAll("input")[0]!.element as HTMLInputElement;

    box.value = "35";
    box.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: "5" }));
    await nextTick();
    expect(digits.value).toEqual(["5", "7", "", "", "", ""]);

    box.value = "abc";
    box.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: "c" }));
    await nextTick();
    expect(digits.value[0]).toBe("");
  });

  it("keeps the stepper within its bounds", async () => {
    const value = ref(2);
    const Stepper = defineComponent({
      setup: () => () =>
        h(NumberStepper, { label: "Fackeln", min: 1, max: 3, modelValue: value.value, "onUpdate:modelValue": (next: number) => (value.value = next) }),
    });
    const { wrapper } = await mountWithApp(Stepper);
    const [decrease, increase] = wrapper.findAll("button");

    expect(increase!.attributes("aria-label")).toBe("Fackeln erhöhen");
    await increase!.trigger("click");
    await nextTick();
    expect(value.value).toBe(3);
    expect(increase!.attributes("disabled")).toBeDefined();
    await decrease!.trigger("click");
    await decrease!.trigger("click");
    await nextTick();
    expect(value.value).toBe(1);
  });

  it("switches segments and toggles as radio group and switch", async () => {
    const segmented = await mountWithApp(SegmentedControl, {
      props: { label: "Dichte", modelValue: "a", options: [{ value: "a", label: "Komfortabel" }, { value: "b", label: "Kompakt" }] },
    });
    await segmented.wrapper.findAll("[role=radio]")[1]!.trigger("click");
    expect(segmented.wrapper.emitted("update:modelValue")).toEqual([["b"]]);

    const toggle = await mountWithApp(ToggleSwitch, { props: { label: "Push", modelValue: false } });
    expect(toggle.wrapper.find("[role=switch]").attributes("aria-checked")).toBe("false");
    await toggle.wrapper.find("[role=switch]").trigger("click");
    expect(toggle.wrapper.emitted("update:modelValue")).toEqual([[true]]);
  });
});
