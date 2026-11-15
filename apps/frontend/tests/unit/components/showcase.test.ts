import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../../../src");

function vueFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".vue")).map((name) => join(dir, name));
}

describe("building blocks page (/_bausteine)", () => {
  it("shows every shared component with its variants", () => {
    const components = [...vueFiles(join(SRC, "components/base")), ...vueFiles(join(SRC, "components/content"))].map(
      (file) => basename(file, ".vue"),
    );
    const showcase = vueFiles(join(SRC, "dev/showcase"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const documented = new Set([...showcase.matchAll(/<ShowcaseComponent\s+name="(\w+)"/g)].map((match) => match[1]));

    expect(components.filter((name) => !documented.has(name))).toEqual([]);
  });
});
