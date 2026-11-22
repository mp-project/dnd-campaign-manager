import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "@vue/compiler-sfc";
import { describe, expect, it } from "vitest";

/**
 * Every button, link, control and form of the public pages carries `data-track`, so Google
 * Analytics sees it (`@/core/telemetry/analytics`). A new element on these pages needs a mark too.
 */
const SRC = resolve(__dirname, "../../../../src");

const PUBLIC_FILES = [
  "components/layout/BrandMark.vue",
  "components/layout/LanguageSwitch.vue",
  "components/layout/PublicHeader.vue",
  "components/layout/PublicMenu.vue",
  "components/layout/SiteFooter.vue",
  "modules/auth/views/LoginView.vue",
  "modules/auth/views/RegisterView.vue",
  "modules/auth/views/WaitlistView.vue",
  "modules/contact/views/ContactView.vue",
  "modules/landing/components/CharacterSheetShowcase.vue",
  "modules/landing/components/InventoryShowcase.vue",
  "modules/landing/components/MarketplaceFan.vue",
  "modules/landing/components/MoreSlider.vue",
  "modules/landing/components/ScreenFrame.vue",
  "modules/landing/components/StorylineTour.vue",
  "modules/landing/views/FaqView.vue",
  "modules/landing/views/LandingView.vue",
  "modules/landing/views/RoadmapView.vue",
  "modules/legal/components/LegalDocument.vue",
  "modules/legal/views/ImprintView.vue",
  "modules/legal/views/PrivacyView.vue",
];

/** Elements somebody clicks or fills in (components in PascalCase). */
const INTERACTIVE = new Set([
  "a",
  "button",
  "form",
  "RouterLink",
  "BaseButton",
  "IconButton",
  "CloseButton",
  "BackLink",
  "PublicNavLink",
  "SegmentedControl",
  "component",
]);

/** Input types that act as buttons. */
const BUTTON_INPUTS = new Set(["submit", "button", "reset", "image"]);

type TemplateNode = {
  type: number;
  tag?: string;
  loc: { start: { line: number } };
  props?: { type: number; name: string; arg?: { content?: string }; exp?: { content?: string } }[];
  children?: TemplateNode[];
};

const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

function isMarked(node: TemplateNode): boolean {
  return (node.props ?? []).some(
    (prop) =>
      (prop.type === ATTRIBUTE && prop.name === "data-track") ||
      (prop.type === DIRECTIVE && prop.name === "bind" && prop.arg?.content === "data-track"),
  );
}

/** `router-link` and `RouterLink` are the same component. */
function pascalCase(tag: string): string {
  return tag.includes("-") ? tag.replace(/(^|-)(\w)/g, (_, _dash: string, letter: string) => letter.toUpperCase()) : tag;
}

function staticAttribute(node: TemplateNode, name: string): string | undefined {
  const prop = node.props?.find((entry) => entry.type === ATTRIBUTE && entry.name === name) as
    | { value?: { content?: string } }
    | undefined;
  return prop?.value?.content;
}

/**
 * `<input>` counts when it is a button; `<component :is>` when its expression names a link or a
 * button (a section heading or a showcase picked by name is none).
 */
function isInteractive(node: TemplateNode): boolean {
  if (!node.tag) return false;
  if (node.tag === "input") return BUTTON_INPUTS.has(staticAttribute(node, "type") ?? "");
  const tag = pascalCase(node.tag);
  if (!INTERACTIVE.has(tag)) return false;
  if (tag !== "component") return true;
  const is = node.props?.find((prop) => prop.type === DIRECTIVE && prop.name === "bind" && prop.arg?.content === "is");
  const expression = is?.exp?.content ?? "";
  return /['"](a|button|RouterLink|router-link)['"]/.test(expression);
}

function unmarked(node: TemplateNode, file: string, found: string[]): void {
  if (node.type === ELEMENT && isInteractive(node) && !isMarked(node)) {
    found.push(`${file}:${node.loc.start.line} <${node.tag}>`);
  }
  for (const child of node.children ?? []) unmarked(child, file, found);
}

describe("analytics marks on the public pages", () => {
  it("marks every button, link, control and form", () => {
    const found: string[] = [];
    for (const file of PUBLIC_FILES) {
      const { descriptor } = parse(readFileSync(resolve(SRC, file), "utf8"), { filename: file });
      const ast = descriptor.template?.ast as TemplateNode | undefined;
      if (ast) unmarked(ast, file, found);
    }
    expect(found).toEqual([]);
  });
});
