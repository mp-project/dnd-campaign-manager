import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { type Component, defineComponent, h, ref } from "vue";

import CountMeta from "@/components/data/CountMeta.vue";
import GenericDataTable from "@/components/data/DataTable.vue";
import HpBar from "@/components/data/HpBar.vue";
import VisibilityLabel from "@/components/data/VisibilityLabel.vue";
import EditorDrawer from "@/components/editor/EditorDrawer.vue";

import { mountWithApp, testRouter } from "../helpers/mount";

// A generic component; the mount helper takes plain components.
const DataTable = GenericDataTable as unknown as Component;

const columns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Typ" },
];
const rows = [
  { id: "1", name: "Grauhafen", type: "Stadt" },
  { id: "2", name: "Zum Kupferkrug", type: "Taverne" },
];

describe("data table", () => {
  it("switches the server-side sort and marks the sorted column", async () => {
    const { wrapper } = await mountWithApp(DataTable, { props: { columns, rows, sort: null } });
    const header = wrapper.find("th[aria-sort]");
    expect(header.attributes("aria-sort")).toBe("none");
    expect(wrapper.findAll("th")[1]!.attributes("aria-sort")).toBeUndefined();

    await header.find("button").trigger("click");
    expect(wrapper.emitted("update:sort")?.at(-1)).toEqual([{ key: "name", direction: "asc" }]);
    await wrapper.setProps({ sort: { key: "name", direction: "asc" } });
    expect(wrapper.find("th[aria-sort]").attributes("aria-sort")).toBe("ascending");
    await wrapper.find("th[aria-sort] button").trigger("click");
    expect(wrapper.emitted("update:sort")?.at(-1)).toEqual([{ key: "name", direction: "desc" }]);
    wrapper.unmount();
  });

  it("opens a row, but leaves clicks on links and buttons inside to them", async () => {
    const router = testRouter();
    await router.push("/orte");
    const { wrapper } = await mountWithApp(DataTable, {
      router,
      props: { columns, rows, rowTo: (row: { id: string }) => `/orte/${row.id}` },
      slots: { actions: '<button type="button">Mehr</button>' },
    });
    await wrapper.find("tbody button").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/orte");

    await wrapper.findAll("tbody td")[1]!.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/orte/1");
    wrapper.unmount();
  });

  it("shows every column as label and value on mobile without a mobile slot, and an empty state", async () => {
    const { wrapper } = await mountWithApp(DataTable, { props: { columns, rows } });
    expect(wrapper.findAll("li dt").map((term) => term.text())).toEqual(["Name", "Typ", "Name", "Typ"]);
    await wrapper.setProps({ rows: [], emptyText: "Noch keine Orte." });
    expect(wrapper.text()).toBe("Noch keine Orte.");
    wrapper.unmount();
  });
});

describe("figures", () => {
  it("reads hit points out and turns red below 35 %", async () => {
    const { wrapper } = await mountWithApp(HpBar, { props: { hp: 12, max: 52, temp: 5 } });
    const meter = wrapper.find('[role="meter"]');
    expect(meter.attributes("aria-label")).toBe("Trefferpunkte 12 von 52, 5 temporär");
    expect(meter.find("div").classes()).toContain("bg-danger");
    wrapper.unmount();
  });

  it("names counters with plural forms for screen readers", async () => {
    const { wrapper } = await mountWithApp(CountMeta, { props: { documents: 1, links: 3 } });
    expect(wrapper.findAll(".sr-only").map((label) => label.text())).toEqual(["Ein Dokument", "3 Verknüpfungen"]);
    wrapper.unmount();
  });

  it("names visibility long and short", async () => {
    const long = await mountWithApp(VisibilityLabel, { props: { value: "all" } });
    expect(long.wrapper.text()).toBe("Alle Mitglieder");
    long.wrapper.unmount();
    const short = await mountWithApp(VisibilityLabel, { props: { value: "all", short: true }, locale: "en" });
    expect(short.wrapper.text()).not.toBe("");
    short.wrapper.unmount();
  });
});

describe("editor drawer", () => {
  const Host = defineComponent({
    props: { busy: Boolean },
    emits: ["save"],
    setup(props, { emit }) {
      const section = ref<string>();
      return () => [
        h("div", { id: "overlay-host" }),
        h(
          EditorDrawer,
          {
            title: "Zum Kupferkrug",
            status: "DRAFT",
            sections: [
              { id: "general", label: "Allgemein" },
              { id: "story", label: "Geschichte" },
            ],
            closeTo: "/orte",
            busy: props.busy,
            modelValue: section.value,
            "onUpdate:modelValue": (value: string | undefined) => (section.value = value),
            onSave: () => emit("save"),
          },
          { default: ({ section: current }: { section: string }) => h("p", { class: "content" }, current) },
        ),
      ];
    },
  });

  async function openEditor(busy = false) {
    const router = testRouter();
    await router.push("/orte/1/bearbeiten");
    const mounted = await mountWithApp(Host, { router, props: { busy } });
    await flushPromises();
    return { ...mounted, router };
  }

  it("starts with the first section, switches sections and reports saving", async () => {
    const { wrapper } = await openEditor();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector(".content")?.textContent).toBe("general");

    const story = [...dialog.querySelectorAll("nav button")].find((button) => button.textContent?.includes("Geschichte")) as HTMLElement;
    story.click();
    await flushPromises();
    expect(dialog.querySelector(".content")?.textContent).toBe("story");

    const save = [...dialog.querySelectorAll("footer button")].at(-1) as HTMLElement;
    save.click();
    expect(wrapper.emitted("save")).toHaveLength(1);
    wrapper.unmount();
  });

  it("closes with Esc and discard, but not while saving", async () => {
    const busy = await openEditor(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(busy.router.currentRoute.value.path).toBe("/orte/1/bearbeiten");
    busy.wrapper.unmount();

    const idle = await openEditor();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(idle.router.currentRoute.value.path).toBe("/orte");
    idle.wrapper.unmount();
  });
});
