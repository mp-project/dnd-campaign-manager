import type { MessageKey } from "@/core/i18n/keys";

import character from "./assets/screens/character.webp";
import map from "./assets/screens/map.webp";
import marketplace from "./assets/screens/marketplace.webp";
import quest from "./assets/screens/quest.webp";
import reputation from "./assets/screens/reputation.webp";
import sessions from "./assets/screens/sessions.webp";
import storyline from "./assets/screens/storyline.webp";

/**
 * Screenshots of the clickdummy (1600 × 1000, German example content) shown on the start page,
 * each with its description and the screen of the demo it shows (`demoPath`, the clickdummy's
 * hash route).
 */
export type Screen = { src: string; alt: MessageKey; demoPath: string };

export const SCREEN_WIDTH = 1600;
export const SCREEN_HEIGHT = 1000;

export const SCREENS = {
  storyline: { src: storyline, alt: "landing.screens.storyline", demoPath: "/kampagne/abenteuer/storylines/schatten-elaria/akt" },
  map: { src: map, alt: "landing.screens.map", demoPath: "/kampagne/welt/orte/atlas" },
  quest: { src: quest, alt: "landing.screens.quest", demoPath: "/kampagne/abenteuer/quests/siegel-nordtor/bearbeiten" },
  character: { src: character, alt: "landing.screens.character", demoPath: "/spiel/charakter" },
  reputation: { src: reputation, alt: "landing.screens.reputation", demoPath: "/kampagne/welt/ruf" },
  sessions: { src: sessions, alt: "landing.screens.sessions", demoPath: "/kampagne/sessions" },
  marketplace: { src: marketplace, alt: "landing.screens.marketplace", demoPath: "/marketplace" },
} satisfies Record<string, Screen>;
