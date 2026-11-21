import { describe, expect, it } from "vitest";

import { remoteLogLevel } from "@/core/telemetry/faro";
import { toFaroContext } from "@/core/telemetry/faroClient";
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
    expect(toFaroContext({ code: "NOT_FOUND", status: 404, details: { a: 1 }, none: undefined })).toEqual({
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
