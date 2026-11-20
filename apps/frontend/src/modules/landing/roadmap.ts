import type { IconName } from "@/components/base/iconNames";
import type { MessageKey } from "@/core/i18n/keys";

/** Where a phase stands; shown as a status badge (`@/core/ui/status`). */
export type RoadmapStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED";

export type RoadmapPhase = {
  id: string;
  icon: IconName;
  status: RoadmapStatus;
  title: MessageKey;
  text: MessageKey;
  items: readonly MessageKey[];
};

const phase = (id: string, icon: IconName, status: RoadmapStatus, items: readonly string[]): RoadmapPhase => ({
  id,
  icon,
  status,
  // i18n-dynamic: landing.roadmap.phases.*
  title: `landing.roadmap.phases.${id}.title` as MessageKey,
  text: `landing.roadmap.phases.${id}.text` as MessageKey,
  items: items.map((item) => `landing.roadmap.phases.${id}.items.${item}` as MessageKey),
});

/**
 * The phases of the roadmap page in their order, without dates. Ids are part of the address
 * (`/roadmap#roadmap-<id>`), so they stay when the wording changes.
 */
export const ROADMAP_PHASES: readonly RoadmapPhase[] = [
  phase("foundation", "orig-zahnrad", "IN_PROGRESS", ["auth", "system", "invitations", "ruleset"]),
  phase("compendium", "nav-kompendium", "PLANNED", ["content", "release", "homebrew"]),
  phase("world", "nav-welt", "PLANNED", ["locations", "maps", "people", "reputation"]),
  phase("adventure", "nav-abenteuer", "PLANNED", ["quests", "encounters", "storylines", "audio"]),
  phase("table", "nav-sessions", "PLANNED", ["characters", "sessions", "chronicle", "players"]),
  phase("exchange", "nav-marketplace", "PLANNED", ["import", "marketplace"]),
  phase("board", "nav-spielbrett", "PLANNED", ["live", "dice", "combat"]),
];

/** Element id of a phase's heading (its address is `#<id>`). */
export const roadmapPhaseId = (id: string) => `roadmap-${id}`;
