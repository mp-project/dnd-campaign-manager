import { describe, expect, it } from "vitest";

import { DEFAULT_SIGNED_IN_PATH, safeRedirectPath } from "@/core/auth/redirect";

describe("safeRedirectPath", () => {
  it("keeps paths of this app with query and hash", () => {
    expect(safeRedirectPath("/k/abc-elaria/welt/orte?seite=2#liste")).toBe("/k/abc-elaria/welt/orte?seite=2#liste");
    expect(safeRedirectPath(["/dashboard?tab=1"])).toBe("/dashboard?tab=1");
  });

  it.each<[unknown, string]>([
    ["https://evil.example/", "other origin"],
    ["//evil.example/path", "protocol-relative"],
    ["/\\evil.example", "backslash"],
    ["/\t/evil.example", "control character"],
    ["javascript:alert(1)", "script"],
    ["dashboard", "no leading slash"],
    ["/", "root"],
    ["/login", "the sign-in itself"],
    ["/login/oauth?status=error", "the provider's return page"],
    ["/registrieren/", "registration"],
    [undefined, "missing"],
    [42, "no string"],
  ])("falls back to the dashboard for %s (%s)", (value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});
