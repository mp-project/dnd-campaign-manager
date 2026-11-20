import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ICON_NAMES } from "@/components/base/iconNames";

describe("icon sprite", () => {
  it("has exactly the symbols the IconName type lists", () => {
    const sprite = readFileSync(join(import.meta.dirname, "../../../public/assets/icons/questaria.svg"), "utf8");
    const symbols = [...sprite.matchAll(/<symbol[^>]*\bid="([^"]+)"/g)].map((match) => match[1]).sort();

    expect(symbols).toEqual([...ICON_NAMES].sort());
  });
});
