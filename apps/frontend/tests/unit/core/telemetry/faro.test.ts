import { describe, expect, it } from "vitest";

import { remoteLogLevel } from "@/core/telemetry/faro";
import { toStringContext } from "@/core/telemetry/stringContext";
import { scrubAddress, scrubAddresses } from "@/core/telemetry/faroPrivacy";

const SHORT_ID = "7xKXtg2CW87d97TXJSDpbD";

describe("Faro privacy", () => {
  it("drops query and fragment, which carry tokens and addresses", () => {
    expect(scrubAddress("https://app.example.de/passwort-zuruecksetzen?token=abc")).toBe(
      "https://app.example.de/passwort-zuruecksetzen",
    );
    expect(scrubAddress("https://app.example.de/invitations/accept#token=abc")).toBe(
      "https://app.example.de/invitations/accept",
    );
    expect(scrubAddress("/api/v1/users?search=lea@example.de")).toBe("/api/v1/users");
  });

  it("keeps the short id of a campaign but not its name", () => {
    expect(scrubAddress(`https://app.example.de/k/${SHORT_ID}-die-schatten-von-elaria/notizen`)).toBe(
      `https://app.example.de/k/${SHORT_ID}/notizen`,
    );
  });

  it("leaves text that is no address alone", () => {
    expect(scrubAddress("Saved? yes #1")).toBe("Saved? yes #1");
  });

  it("scrubs addresses anywhere in an item", () => {
    const item = {
      type: "event",
      meta: { page: { url: "https://app.example.de/login?redirect=/k/x" } },
      payload: { attributes: { name: "click", list: ["/x?y=1", 3] } },
    };

    expect(scrubAddresses(item)).toEqual({
      type: "event",
      meta: { page: { url: "https://app.example.de/login" } },
      payload: { attributes: { name: "click", list: ["/x", 3] } },
    });
    expect(item.meta.page.url).toContain("?redirect");
  });
});

describe("Faro logs", () => {
  it("turns the context into strings", () => {
    expect(toStringContext({ code: "NOT_FOUND", status: 404, details: { a: 1 }, none: undefined })).toEqual({
      code: "NOT_FOUND",
      status: "404",
      details: '{"a":1}',
    });
  });

  it("reads the remote log level, info when unknown", () => {
    expect(remoteLogLevel("warn")).toBe("warn");
    expect(remoteLogLevel(undefined)).toBe("info");
    expect(remoteLogLevel("verbose")).toBe("info");
  });
});

describe("Sentry events", () => {
  it("keeps only the scrubbed address, the user id and scrubbed breadcrumbs", async () => {
    const { scrubSentryEvent } = await import("@/core/telemetry/sentryClient");
    const event = scrubSentryEvent({
      type: undefined,
      request: { url: "https://app.example.de/passwort-zuruecksetzen?token=abc", headers: { Referer: "x" } },
      user: { id: "u-1", email: "a@b.de" },
      breadcrumbs: [{ category: "navigation", data: { to: "/invitations/accept#token=abc" } }],
    });

    expect(event.request).toEqual({ url: "https://app.example.de/passwort-zuruecksetzen" });
    expect(event.user).toEqual({ id: "u-1" });
    expect(event.breadcrumbs?.[0]?.data).toEqual({ to: "/invitations/accept" });
  });
});
