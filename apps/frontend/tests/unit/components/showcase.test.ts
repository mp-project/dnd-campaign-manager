import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../../../src");

function vueFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".vue")).map((name) => join(dir, name));
}

/** Parts of the app shell that need a session and a campaign; they are seen in the app itself. */
const SHOWN_IN_SHELL = new Set([
  "AppSidebar",
  "AppTopbar",
  "MobileHeader",
  "MobileNavPanel",
  "ShellNavigation",
  "SidebarCampaign",
  "UserMenu",
]);

describe("building blocks page (/_bausteine)", () => {
  it("shows every shared component with its variants", () => {
    const components = ["base", "content", "page", "layout"]
      .flatMap((group) => vueFiles(join(SRC, "components", group)))
      .map((file) => basename(file, ".vue"))
      .filter((name) => !SHOWN_IN_SHELL.has(name));
    const showcase = vueFiles(join(SRC, "dev/showcase"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const documented = new Set([...showcase.matchAll(/<ShowcaseComponent\s+name="(\w+)"/g)].map((match) => match[1]));

    expect(components.filter((name) => !documented.has(name))).toEqual([]);
  });
});
