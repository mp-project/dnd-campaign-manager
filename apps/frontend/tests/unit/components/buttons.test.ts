import { afterEach, describe, expect, it } from "vitest";

import BaseButton from "@/components/base/BaseButton.vue";
import CloseButton from "@/components/base/CloseButton.vue";
import IconButton from "@/components/base/IconButton.vue";

import { mountWithApp } from "../helpers/mount";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("buttons", () => {
  it("renders variant and size classes and the label", async () => {
    const { wrapper } = await mountWithApp(BaseButton, { props: { variant: "primary", size: "sm", label: "Ort erstellen" } });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("type")).toBe("button");
    expect(wrapper.classes()).toEqual(expect.arrayContaining(["btn", "btn-primary", "btn-sm"]));
    expect(wrapper.text()).toBe("Ort erstellen");
  });

  it("renders a router link with `to`", async () => {
    const { wrapper } = await mountWithApp(BaseButton, { props: { to: "/kampagnen", label: "Kampagnen" } });

    expect(wrapper.element.tagName).toBe("A");
    expect(wrapper.attributes("href")).toBe("/kampagnen");
    expect(wrapper.attributes("type")).toBeUndefined();
  });

  it("gives icon-only buttons their label as aria-label and tooltip", async () => {
    const { wrapper } = await mountWithApp(IconButton, { props: { icon: "aktion-bearbeiten", label: "Ort bearbeiten" } });

    expect(wrapper.attributes("aria-label")).toBe("Ort bearbeiten");
    expect(wrapper.attributes("title")).toBe("Ort bearbeiten");
    expect(wrapper.classes()).toContain("btn-icon");
    expect(wrapper.find("use").attributes("href")).toMatch(/chronik\.svg#aktion-bearbeiten$/);
  });

  it("labels the close button in the active language", async () => {
    const de = await mountWithApp(CloseButton);
    const en = await mountWithApp(CloseButton, { locale: "en" });

    expect(de.wrapper.attributes("aria-label")).toBe("Schließen");
    expect(en.wrapper.attributes("aria-label")).toBe("Close");
  });
});
