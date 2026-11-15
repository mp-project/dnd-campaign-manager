import { computed, type InjectionKey, inject } from "vue";
import { type RouteLocationRaw, useRoute } from "vue-router";

import type { IconName } from "@/components/base/iconNames";
import { useCurrentCampaign } from "@/core/campaign/campaign";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import type { CampaignNavSection, NavItem } from "@/core/modules";
import { useCan } from "@/core/permissions/useCan";

/**
 * The navigation is built from the entries of the registered modules (`app/modules.ts`); this
 * file only knows the order of sections, the groups and the dividers. Sidebar, mobile panel and
 * bottom bars all read it from here.
 */

/** All entries of all modules; provided once by the app. */
export const NAV_ITEMS: InjectionKey<readonly NavItem[]> = Symbol("navItems");

export type NavLink = { id: string; label: string; icon: IconName; to: RouteLocationRaw };
export type NavGroupId = Extract<CampaignNavSection, "world" | "adventure" | "compendium">;
export type NavEntry =
  | { kind: "link"; link: NavLink }
  | { kind: "group"; id: NavGroupId; label: string; icon: IconName; links: NavLink[] }
  | { kind: "divider"; id: string };
export type BottomNavTarget = NavLink | { id: "content" | "more"; label: string; icon: IconName; panel: "content" | "more" };

const GROUPS: Record<NavGroupId, { label: MessageKey; icon: IconName }> = {
  world: { label: "common.nav.world", icon: "nav-welt" },
  adventure: { label: "common.nav.adventure", icon: "nav-abenteuer" },
  compendium: { label: "common.nav.compendium", icon: "nav-kompendium" },
};

/** Blocks of the campaign navigation; a divider separates non-empty blocks. */
const CAMPAIGN_BLOCKS: CampaignNavSection[][] = [["start", "world", "adventure", "compendium"], ["play"], ["manage"]];

/** How many module entries fit into the campaign's bottom bar next to overview, content and more. */
const BOTTOM_SLOTS = 2;

type Translate = (key: MessageKey) => string;
type Visible = (item: NavItem) => boolean;

type CampaignItem = Extract<NavItem, { area: "campaign" }>;
type PlayerItem = Extract<NavItem, { area: "player" }>;

const byOrder = (a: NavItem, b: NavItem) => a.order - b.order;

function link(item: NavItem, t: Translate, segment?: string): NavLink {
  return {
    id: item.id,
    label: t(item.label),
    icon: item.icon,
    to: segment ? { name: item.route, params: { campaign: segment } } : { name: item.route },
  };
}

export function accountLinks(items: readonly NavItem[], visible: Visible, t: Translate): NavLink[] {
  return items
    .filter((item) => item.area === "account" && visible(item))
    .sort(byOrder)
    .map((item) => link(item, t));
}

function campaignItems(items: readonly NavItem[], visible: Visible, section: CampaignNavSection): CampaignItem[] {
  return items
    .filter((item): item is CampaignItem => item.area === "campaign" && item.section === section && visible(item))
    .sort(byOrder);
}

export function campaignEntries(items: readonly NavItem[], visible: Visible, t: Translate, segment: string): NavEntry[] {
  const blocks = CAMPAIGN_BLOCKS.map((sections) =>
    sections.flatMap((section): NavEntry[] => {
      const links = campaignItems(items, visible, section).map((item) => link(item, t, segment));
      if (links.length === 0) return [];
      if (section in GROUPS) {
        const group = GROUPS[section as NavGroupId];
        return [{ kind: "group", id: section as NavGroupId, label: t(group.label), icon: group.icon, links }];
      }
      return links.map((navLink) => ({ kind: "link", link: navLink }));
    }),
  ).filter((block) => block.length > 0);

  return blocks.flatMap((block, index) => (index === 0 ? block : [{ kind: "divider", id: `divider-${index}` }, ...block]));
}

/** Group of the campaign navigation that holds an entry, to open it when the entry is active. */
export function groupOf(items: readonly NavItem[], id: string | undefined): NavGroupId | null {
  const item = items.find((entry) => entry.id === id);
  return item?.area === "campaign" && item.section in GROUPS ? (item.section as NavGroupId) : null;
}

/** Overview, content (opens the panel at the groups), the entries marked `mobile`, more. */
export function campaignBottomTargets(
  items: readonly NavItem[],
  visible: Visible,
  t: Translate,
  segment: string,
): BottomNavTarget[] {
  const [overview] = campaignItems(items, visible, "start");
  const hasContent = (Object.keys(GROUPS) as NavGroupId[]).some((group) => campaignItems(items, visible, group).length > 0);
  const marked = (["play", "manage"] as const)
    .flatMap((section) => campaignItems(items, visible, section))
    .filter((item) => item.mobile)
    .slice(0, BOTTOM_SLOTS);

  return [
    ...(overview ? [link(overview, t, segment)] : []),
    ...(hasContent ? [{ id: "content" as const, label: t("common.nav.content"), icon: "nav-inhalte" as const, panel: "content" as const }] : []),
    ...marked.map((item) => link(item, t, segment)),
    { id: "more", label: t("common.nav.more"), icon: "aktion-mehr", panel: "more" },
  ];
}

export function playerLinks(items: readonly NavItem[], visible: Visible, t: Translate, segment: string): NavLink[] {
  return items
    .filter((item): item is PlayerItem => item.area === "player" && visible(item))
    .sort(byOrder)
    .map((item) => link(item, t, segment));
}

/** Player entries with a short label, for the bottom bar (at most five). */
export function playerBottomTargets(items: readonly NavItem[], visible: Visible, t: Translate, segment: string): NavLink[] {
  return items
    .filter((item): item is PlayerItem & { mobileLabel: MessageKey } => item.area === "player" && !!item.mobileLabel && visible(item))
    .sort(byOrder)
    .slice(0, 5)
    .map((item) => ({ ...link(item, t, segment), label: t(item.mobileLabel) }));
}

/**
 * The navigation for the current page. `campaignMode` says which campaign navigation applies:
 * the player view in its own area and for players everywhere, the full one otherwise.
 */
export function useNavigation() {
  const items = inject(NAV_ITEMS, []);
  const route = useRoute();
  const { t } = useAppI18n();
  const { canGlobally, canInCampaign } = useCan();
  const { campaign, segment, role } = useCurrentCampaign();
  // Account entries count with the account's permissions, campaign entries with the campaign's they lead to.
  const visible: Visible = (item) =>
    !item.permission || (item.area === "account" ? canGlobally(item.permission) : canInCampaign(item.permission));

  const campaignMode = computed<"campaign" | "player">(() =>
    route.meta.area === "player" || (route.meta.area !== "campaign" && role.value === "PLAYER") ? "player" : "campaign",
  );

  return {
    campaign,
    segment,
    campaignMode,
    activeId: computed(() => route.meta.nav),
    activeGroup: computed(() => groupOf(items, route.meta.nav)),
    account: computed(() => accountLinks(items, visible, t)),
    campaignEntries: computed(() => (segment.value ? campaignEntries(items, visible, t, segment.value) : [])),
    playerLinks: computed(() => (segment.value ? playerLinks(items, visible, t, segment.value) : [])),
    campaignBottom: computed(() => (segment.value ? campaignBottomTargets(items, visible, t, segment.value) : [])),
    playerBottom: computed(() => (segment.value ? playerBottomTargets(items, visible, t, segment.value) : [])),
    /** Game master, editors and administrators switch between the campaign area and the player view. */
    viewSwitch: computed(() => {
      if (!segment.value || role.value === "PLAYER") return null;
      const base = `/k/${segment.value}`;
      if (route.meta.area === "campaign") return { label: t("common.shell.playerView"), to: `${base}/spiel` };
      if (route.meta.area === "player") return { label: t("common.shell.campaignView"), to: base };
      return null;
    }),
  };
}
