import { describe, expect, it } from "vitest";

import BottomNav from "@/components/layout/BottomNav.vue";
import NavTree from "@/components/layout/NavTree.vue";
import AppBreadcrumb from "@/components/page/AppBreadcrumb.vue";
import type { NavEntry, NavLink } from "@/core/navigation/navigation";

import { mountWithApp } from "../helpers/mount";

const link = (id: string, label: string): NavLink => ({ id, label, icon: "nav-orte", to: `/${id}` });
const account = [link("dashboard", "Dashboard")];
const campaign: NavEntry[] = [
  { kind: "link", link: link("overview", "Übersicht") },
  { kind: "group", id: "world", label: "Welt", icon: "nav-welt", links: [link("locations", "Orte"), link("persons", "Personen")] },
  { kind: "group", id: "adventure", label: "Abenteuer", icon: "nav-abenteuer", links: [link("quests", "Quests")] },
  { kind: "divider", id: "divider-1" },
  { kind: "link", link: link("notes", "Notizen") },
];

describe("navigation tree", () => {
  it("marks the active entry and opens its group only", async () => {
    const { wrapper } = await mountWithApp(NavTree, {
      props: { account, campaign, activeId: "persons", activeGroup: "world" },
    });
    const current = wrapper.find('[aria-current="page"]');
    expect(current.text()).toBe("Personen");
    expect(current.classes()).toContain("is-active");
    const groups = wrapper.findAll("button[aria-expanded]");
    expect(groups.map((group) => group.attributes("aria-expanded"))).toEqual(["true", "false"]);
    expect(wrapper.text()).toContain("Dein Konto");
    expect(wrapper.find('[role="separator"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("toggles groups and opens them from outside (mobile content)", async () => {
    const { wrapper } = await mountWithApp(NavTree, { props: { account, campaign } });
    const [world] = wrapper.findAll("button[aria-expanded]");
    await world!.trigger("click");
    expect(world!.attributes("aria-expanded")).toBe("true");
    (wrapper.vm as unknown as { openGroups: (groups: string[]) => void }).openGroups(["adventure"]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("button[aria-expanded]").map((group) => group.attributes("aria-expanded"))).toEqual(["true", "true"]);
    wrapper.unmount();
  });

  it("keeps labels for screen readers when collapsed and shows the empty campaign slot", async () => {
    const { wrapper } = await mountWithApp(NavTree, {
      props: { account, campaign: [], compact: true },
      slots: { "campaign-empty": "<p class='hint'>Keine Kampagne</p>" },
    });
    expect(wrapper.find("nav").classes()).toContain("nav-compact");
    expect(wrapper.find(".nav-label").text()).toBe("Dashboard");
    expect(wrapper.find("a").attributes("title")).toBe("Dashboard");
    expect(wrapper.find(".hint").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("bottom bar", () => {
  it("links targets, opens panels and marks the active one", async () => {
    const { wrapper } = await mountWithApp(BottomNav, {
      props: {
        label: "Kampagnennavigation",
        active: "content",
        targets: [link("overview", "Übersicht"), { id: "content", label: "Inhalte", icon: "nav-inhalte", panel: "content" }],
      },
    });
    expect(wrapper.find("nav").attributes("aria-label")).toBe("Kampagnennavigation");
    const button = wrapper.find("button");
    expect(button.classes()).toContain("bottom-nav-active");
    await button.trigger("click");
    expect(wrapper.emitted("panel")).toEqual([["content"]]);
    wrapper.unmount();
  });
});

describe("breadcrumb", () => {
  it("links all but the last item, which is the current page", async () => {
    const { wrapper } = await mountWithApp(AppBreadcrumb, {
      props: { items: [{ label: "Welt", to: "/welt" }, { label: "Orte", to: "/welt/orte" }, { label: "Zum Kupferkrug" }] },
    });
    expect(wrapper.findAll("a").map((anchor) => anchor.text())).toEqual(["Welt", "Orte"]);
    expect(wrapper.find('[aria-current="page"]').text()).toBe("Zum Kupferkrug");
    expect(wrapper.find("nav").attributes("aria-label")).toBe("Brotkrumen");
    wrapper.unmount();
  });
});
