import type { MessageKey } from "@/core/i18n/keys";

import gateImage from "./assets/storyline/grauhafen-nordtor.webp";
import harbourImage from "./assets/storyline/grauhafen-marktplatz.webp";
import caveImage from "./assets/storyline/hoehle-westpfad.webp";
import towerImage from "./assets/storyline/wachturm-rabenhoehe.webp";
import groveImage from "./assets/storyline/morgenhain.webp";

/*
 * The act board of the clickdummy's storyline "Der Nebelpakt" (desktop layout, left to right) as
 * data for the start page: acts, sections with their place on the board, connections and routes.
 * Positions are in board pixels; the geometry (ports, curves, junctions) is the clickdummy's.
 * Texts are message keys under `landing.storylineBoard`.
 */

export type RouteId = "official" | "secret";
type Box = { x: number; y: number; w: number; h: number };

export type BoardSection = Box & {
  id: string;
  kind: "start" | "scene" | "end";
  act: number;
  route: RouteId | null;
  image?: string;
  /** The card names what it is linked to (a person, a clue …) instead of its ways in and on. */
  link?: boolean;
};

export type BoardEdge = { from: string; to: string; choice?: boolean };

export type BoardAct = Box & { n: number; labelX: number };

export const BOARD_WIDTH = 3200;
export const BOARD_HEIGHT = 1000;

export const ACTS: readonly BoardAct[] = [
  { n: 1, x: 20, y: 16, w: 1800, h: 968, labelX: 420 },
  { n: 2, x: 1850, y: 16, w: 760, h: 968, labelX: 1874 },
  { n: 3, x: 2640, y: 16, w: 520, h: 968, labelX: 2664 },
];

export const SECTIONS: readonly BoardSection[] = [
  { id: "S00", kind: "start", act: 1, route: null, x: 40, y: 420, w: 300, h: 160 },
  { id: "S01", kind: "scene", link: true, act: 1, route: "official", image: gateImage, x: 440, y: 100, w: 420, h: 272 },
  { id: "S02", kind: "scene", link: true, act: 1, route: "official", image: harbourImage, x: 440, y: 400, w: 420, h: 272 },
  { id: "S03", kind: "scene", link: true, act: 1, route: "secret", image: caveImage, x: 440, y: 700, w: 420, h: 272 },
  { id: "S04", kind: "scene", act: 1, route: "official", image: gateImage, x: 1300, y: 250, w: 440, h: 276 },
  { id: "S05", kind: "scene", act: 1, route: "secret", image: caveImage, x: 1300, y: 700, w: 440, h: 276 },
  { id: "S06", kind: "scene", link: true, act: 2, route: "official", image: towerImage, x: 1960, y: 250, w: 440, h: 276 },
  { id: "S07", kind: "scene", link: true, act: 2, route: "secret", image: caveImage, x: 1960, y: 700, w: 440, h: 276 },
  { id: "E1", kind: "end", act: 3, route: null, image: groveImage, x: 2700, y: 250, w: 420, h: 276 },
  { id: "E2", kind: "end", act: 3, route: null, image: caveImage, x: 2700, y: 700, w: 420, h: 276 },
];

export const EDGES: readonly BoardEdge[] = [
  { from: "S00", to: "S01" },
  { from: "S00", to: "S02" },
  { from: "S00", to: "S03" },
  { from: "S01", to: "S04", choice: true },
  { from: "S02", to: "S04", choice: true },
  { from: "S03", to: "S05", choice: true },
  { from: "S04", to: "S06" },
  { from: "S05", to: "S07" },
  { from: "S06", to: "E1" },
  { from: "S07", to: "E1" },
  { from: "S07", to: "E2" },
];

/** The two rides of the tour: the sections the camera visits, in order. */
export const RIDES: Record<RouteId, readonly string[]> = {
  official: ["S00", "S01", "S04", "S06", "E1"],
  secret: ["S00", "S03", "S05", "S07", "E2"],
};

// i18n-dynamic: landing.storylineBoard.*
export const sectionText = (id: string, part: "title" | "description" | "location" | "tag" | "link") =>
  `landing.storylineBoard.sections.${id}.${part}` as MessageKey;
export const actText = (n: number, part: "title" | "summary") => `landing.storylineBoard.acts.${n}.${part}` as MessageKey;
export const edgeText = (key: string, part: "choice" | "condition") => `landing.storylineBoard.edges.${key}.${part}` as MessageKey;

// ---- Geometry (the clickdummy's `graph.js`, desktop only) ------------------------------------

/** Vertical offset of a scene card's ports: the height of its title row. */
const PORT_Y = 128;
/** A junction sits this far before the entrance of a section with several incoming connections. */
const JUNCTION_GAP = 100;
/** Length of an arrow head; a line with an arrow ends this far before the card, the head fills the rest. */
export const ARROW_LENGTH = 13;
/** The last part of a line runs straight, so the arrow head sits on it and the line meets its base. */
const STRAIGHT_END = 18;

type Point = { x: number; y: number };

const portOut = (s: BoardSection): Point => ({ x: s.x + s.w, y: s.y + (s.kind === "start" ? s.h / 2 : PORT_Y) });
const portIn = (s: BoardSection): Point => ({ x: s.x, y: s.y + (s.kind === "start" ? s.h / 2 : PORT_Y) });

function bezier(a: Point, b: Point): string {
  const dx = Math.max(40, (b.x - a.x) / 2);
  return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}

/** A curve that ends in a straight piece before `b`, leaving room for the arrow head. */
function arrowed(a: Point, b: Point): string {
  const end = b.x - ARROW_LENGTH;
  return `${bezier(a, { x: end - STRAIGHT_END, y: b.y })} H${end}`;
}

/** Colour of a line: gold from the start, else the route of where it leads (into an end: where it comes from). */
export type LineColor = RouteId | "gold";

/** `x1`/`x2`: where the line starts and ends horizontally (the gold runs from one to the other). */
export type EdgeShape = { key: string; edge: BoardEdge; d: string; color: LineColor; arrow: boolean; x1: number; x2: number; label: (Point & { w: number }) | null };
export type JoinShape = { key: string; x: number; y: number; d: string; color: LineColor; x1: number; x2: number };

export const sectionById = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<string, BoardSection>;
export const edgeKey = (edge: BoardEdge) => `${edge.from}-${edge.to}`;

export function layoutBoard(): { edges: EdgeShape[]; joins: JoinShape[] } {
  const incoming: Record<string, number> = {};
  EDGES.forEach((e) => (incoming[e.to] = (incoming[e.to] ?? 0) + 1));
  const colorOf = (e: BoardEdge): LineColor => {
    const from = sectionById[e.from]!;
    const to = sectionById[e.to]!;
    if (from.kind === "start") return "gold";
    return (to.kind === "end" ? from.route : to.route) ?? "official";
  };
  const joins: Record<string, JoinShape> = {};
  const edges = EDGES.map((e) => {
    const a = portOut(sectionById[e.from]!);
    const entrance = portIn(sectionById[e.to]!);
    const shared = (incoming[e.to] ?? 0) > 1;
    const b = shared ? { x: entrance.x - JUNCTION_GAP, y: entrance.y } : entrance;
    if (shared) {
      joins[e.to] ??= { key: e.to, x: b.x, y: b.y, d: `M${b.x} ${b.y} H${entrance.x - ARROW_LENGTH}`, color: colorOf(e), x1: b.x, x2: entrance.x - ARROW_LENGTH };
    }
    return {
      key: edgeKey(e),
      edge: e,
      color: colorOf(e),
      arrow: !shared,
      x1: a.x,
      x2: shared ? b.x : b.x - ARROW_LENGTH,
      d: shared ? bezier(a, b) : arrowed(a, b),
      label: e.choice ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: Math.max(150, Math.min(250, b.x - a.x - 24)) } : null,
    };
  });
  return { edges, joins: Object.values(joins) };
}

/** How many connections lead into and out of each section. */
export const DEGREE = EDGES.reduce<Record<string, { in: number; out: number }>>((all, e) => {
  (all[e.from] ??= { in: 0, out: 0 }).out += 1;
  (all[e.to] ??= { in: 0, out: 0 }).in += 1;
  return all;
}, {});
