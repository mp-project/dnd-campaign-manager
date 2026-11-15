import { describe, expect, it } from "vitest";

import FilterSelect from "@/components/page/FilterSelect.vue";
import FormFooter from "@/components/page/FormFooter.vue";
import ListPageHeader from "@/components/page/ListPageHeader.vue";
import ListToolbar from "@/components/page/ListToolbar.vue";
import PaginationBar from "@/components/page/PaginationBar.vue";
import ResultBar from "@/components/page/ResultBar.vue";

import { mountWithApp } from "../helpers/mount";

const options = [
  { value: "CITY", label: "Stadt" },
  { value: "TAVERN", label: "Taverne" },
];

describe("list head", () => {
  it("offers creating and the menu only when the page passes them", async () => {
    const gm = await mountWithApp(ListPageHeader, {
      props: { title: "Orte", createLabel: "Ort erstellen", menuLabel: "Übernehmen", menuItems: [{ label: "Aus der Bibliothek" }] },
    });
    expect(gm.wrapper.text()).toContain("Ort erstellen");
    expect(gm.wrapper.text()).toContain("Übernehmen");
    const create = gm.wrapper.findAll("button").find((button) => button.text() === "Ort erstellen");
    await create!.trigger("click");
    expect(gm.wrapper.emitted("create")).toHaveLength(1);
    gm.wrapper.unmount();

    const player = await mountWithApp(ListPageHeader, { props: { title: "Orte" } });
    expect(player.wrapper.findAll("button")).toHaveLength(0);
    player.wrapper.unmount();
  });
});

describe("filters", () => {
  it("chooses several values and shows how many", async () => {
    const { wrapper } = await mountWithApp(FilterSelect, { props: { label: "Typ", options, modelValue: [] } });
    await wrapper.find("button").trigger("click");
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["TAVERN"]]);
    await wrapper.setProps({ modelValue: ["TAVERN"] });
    expect(wrapper.find("button").text()).toContain("1");
    wrapper.unmount();
  });

  it("counts active filters on mobile and resets filters and search", async () => {
    const { wrapper } = await mountWithApp(ListToolbar, {
      props: {
        query: "krug",
        active: { type: ["CITY", "TAVERN"] },
        filters: [{ key: "type", label: "Typ", options }],
      },
    });
    const filterButton = wrapper.findAll("button").find((button) => button.text().startsWith("Filter") && !button.text().includes("zurücksetzen"));
    expect(filterButton!.text()).toContain("2");

    await filterButton!.trigger("click");
    const chip = wrapper.findAll("button[aria-pressed]").find((button) => button.text() === "Stadt");
    expect(chip!.attributes("aria-pressed")).toBe("true");
    await chip!.trigger("click");
    expect(wrapper.emitted("update:active")?.at(-1)).toEqual([{ type: ["TAVERN"] }]);

    await wrapper.findAll("button").find((button) => button.text() === "Filter zurücksetzen")!.trigger("click");
    expect(wrapper.emitted("update:active")?.at(-1)).toEqual([{}]);
    expect(wrapper.emitted("update:query")?.at(-1)).toEqual([""]);
    wrapper.unmount();
  });

  it("switches between list and grid", async () => {
    const { wrapper } = await mountWithApp(ResultBar, { props: { text: "24 Orte", views: true, view: "list" } });
    await wrapper.find('button[aria-label="Rasteransicht"]').trigger("click");
    expect(wrapper.emitted("update:view")).toEqual([["grid"]]);
    wrapper.unmount();
  });
});

describe("pages", () => {
  it("shortens the page list around the current page and shows the range", async () => {
    const { wrapper } = await mountWithApp(PaginationBar, { props: { modelValue: 5, perPage: 10, pages: 12, total: 118 } });
    const numbers = wrapper.findAll("nav button.num").map((button) => button.text());
    expect(numbers).toEqual(["1", "4", "5", "6", "12"]);
    expect(wrapper.text()).toContain("41–50 von 118");
    expect(wrapper.find('[aria-current="page"]').text()).toBe("5");

    await wrapper.find('button[aria-label="Nächste Seite"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[6]]);
    wrapper.unmount();
  });

  it("can't go before the first page", async () => {
    const { wrapper } = await mountWithApp(PaginationBar, { props: { modelValue: 1, pages: 3 } });
    expect(wrapper.find('button[aria-label="Vorherige Seite"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});

describe("form footer", () => {
  it("reports save and discard once and blocks both while busy", async () => {
    const { wrapper } = await mountWithApp(FormFooter, { props: { saveLabel: "Kampagne speichern" } });
    const [discard, save] = wrapper.findAll("button");
    await save!.trigger("click");
    await discard!.trigger("click");
    expect(wrapper.emitted("save")).toHaveLength(1);
    expect(wrapper.emitted("discard")).toHaveLength(1);

    await wrapper.setProps({ busy: true });
    expect(wrapper.findAll("button").every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    wrapper.unmount();
  });
});
