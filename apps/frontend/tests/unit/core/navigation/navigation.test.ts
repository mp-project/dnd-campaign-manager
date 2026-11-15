import { describe, expect, it } from "vitest";

import type { MessageKey } from "@/core/i18n/keys";
import type { NavItem } from "@/core/modules";
import {
  accountLinks,
  campaignBottomTargets,
  campaignEntries,
  groupOf,
  playerBottomTargets,
  playerLinks,
} from "@/core/navigation/navigation";

const t = (key: MessageKey) => `t:${key}`;
const all = () => true;
const label = "common.nav.more" as MessageKey;

function campaign(id: string, section: Extract<NavItem, { area: "campaign" }>["section"], order: number, extra: object = {}): NavItem {
  return { id, area: "campaign", section, order, label, icon: "nav-orte", route: id, ...extra } as NavItem;
}

const items: NavItem[] = [
  { id: "dashboard", area: "account", order: 10, label, icon: "nav-dashboard", route: "dashboard" },
  campaign("settings", "manage", 20, { permission: "campaigns.update" }),
  campaign("persons", "world", 20),
  campaign("locations", "world", 10),
  campaign("overview", "start", 10),
  campaign("sessions", "play", 20, { mobile: true }),
  campaign("notes", "play", 30, { mobile: true }),
  campaign("characters", "play", 10, { mobile: true }),
  campaign("spells", "compendium", 10),
];

const ids = (entries: ReturnType<typeof campaignEntries>) =>
  entries.map((entry) =>
    entry.kind === "group" ? `${entry.id}[${entry.links.map((link) => link.id).join(",")}]` : entry.kind === "link" ? entry.link.id : "|",
  );

describe("navigation from module entries", () => {
  it("orders the campaign's sections, groups content and separates blocks", () => {
    expect(ids(campaignEntries(items, all, t, "seg"))).toEqual([
      "overview",
      "world[locations,persons]",
      "compendium[spells]",
      "|",
      "characters",
      "sessions",
      "notes",
      "|",
      "settings",
    ]);
  });

  it("leaves out what the viewer may not use, with its divider and empty groups", () => {
    const visible = (item: NavItem) => item.permission !== "campaigns.update" && item.id !== "spells";
    expect(ids(campaignEntries(items, visible, t, "seg"))).toEqual([
      "overview",
      "world[locations,persons]",
      "|",
      "characters",
      "sessions",
      "notes",
    ]);
  });

  it("links campaign entries with the campaign and translates labels", () => {
    const [overview] = campaignEntries(items, all, t, "4fJ8-elaria");
    expect(overview).toEqual({
      kind: "link",
      link: { id: "overview", label: "t:common.nav.more", icon: "nav-orte", to: { name: "overview", params: { campaign: "4fJ8-elaria" } } },
    });
    expect(accountLinks(items, all, t).map((link) => link.to)).toEqual([{ name: "dashboard" }]);
  });

  it("finds the group of the active entry", () => {
    expect(groupOf(items, "persons")).toBe("world");
    expect(groupOf(items, "sessions")).toBeNull();
    expect(groupOf(items, undefined)).toBeNull();
  });

  it("fills the campaign's bottom bar: overview, content, two marked entries, more", () => {
    expect(campaignBottomTargets(items, all, t, "seg").map((target) => target.id)).toEqual([
      "overview",
      "content",
      "characters",
      "sessions",
      "more",
    ]);
    const withoutContent = items.filter((item) => item.area !== "campaign" || ["start", "play"].includes(item.section));
    expect(campaignBottomTargets(withoutContent, all, t, "seg").map((target) => target.id)).not.toContain("content");
  });

  it("shows player entries in order; the bottom bar only those with a short label", () => {
    const player: NavItem[] = [
      { id: "notes", area: "player", order: 30, label, icon: "nav-notizen", route: "notes" },
      { id: "board", area: "player", order: 20, label, mobileLabel: "common.nav.content", icon: "nav-spielbrett", route: "board" },
      { id: "overview", area: "player", order: 10, label, mobileLabel: "common.nav.world", icon: "nav-uebersicht", route: "overview" },
    ];
    expect(playerLinks(player, all, t, "seg").map((link) => link.id)).toEqual(["overview", "board", "notes"]);
    expect(playerBottomTargets(player, all, t, "seg").map((link) => [link.id, link.label])).toEqual([
      ["overview", "t:common.nav.world"],
      ["board", "t:common.nav.content"],
    ]);
  });
});
