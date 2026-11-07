import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { normalizeRedirectPath } from "#src/modules/auth/service/AuthService.utils";

describe("normalizeRedirectPath", () => {
  it.each(["/", "/campaigns/1", "/notes?tab=all#top", "/a/b%20c"])("keeps %s", (path) => {
    expect(normalizeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/ /evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "relative/path",
    "",
    `/${"a".repeat(500)}`,
  ])("replaces %j with /", (path) => {
    expect(normalizeRedirectPath(path)).toBe("/");
  });
});

describe("frontend redirects", () => {
  const http = new AuthHttpSupport({
    secureCookies: false,
    frontendOrigin: "https://app.example.test",
  });

  it("never leaves the frontend origin", () => {
    expect(new URL(http.frontendRedirectUrl("/\\evil.example")).origin).toBe(
      "https://app.example.test",
    );
  });

  it("normalizes the redirect parameter of the callback page, also on error paths", () => {
    const url = new URL(http.frontendCallbackUrl("error", "/\\evil.example"));

    expect(url.origin).toBe("https://app.example.test");
    expect(url.searchParams.get("redirect")).toBe("/");
  });
});
