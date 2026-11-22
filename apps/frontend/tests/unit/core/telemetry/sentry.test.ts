import { QueryClient } from "@tanstack/vue-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  captureError: vi.fn(),
  breadcrumb: vi.fn(),
  log: vi.fn(),
  setUser: vi.fn(),
  startReplay: vi.fn(),
  stopReplay: vi.fn(),
}));

vi.mock("@/core/telemetry/sentryClient", () => ({ startSentryClient: vi.fn(() => client) }));

describe("Sentry in the frontend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function load(devConsent = "") {
    vi.stubEnv("VITE_SENTRY_DSN", "https://key@o1.ingest.de.sentry.io/1");
    vi.stubEnv("VITE_COOKIEBOT_ID", "");
    vi.stubEnv("VITE_DEV_CONSENT", devConsent);
    const sentry = await import("@/core/telemetry/sentry");
    const log = await import("@/core/log");
    const consent = await import("@/core/consent/consent");
    return { sentry, log, consent };
  }

  it("reports errors raised before the SDK arrived once it is there", async () => {
    const { sentry, log } = await load();

    sentry.installSentry(new QueryClient());
    log.reportError(new Error("early"), { source: "vue" });

    await vi.waitFor(() => expect(client.captureError).toHaveBeenCalled());
    expect(client.captureError.mock.calls[0]?.[0]).toEqual(new Error("early"));
  });

  it("does not report expected errors", async () => {
    const { sentry, log } = await load();
    const { ApiError } = await import("@/core/api/errors");

    sentry.installSentry(new QueryClient());
    await vi.waitFor(() => expect(client.setUser).toHaveBeenCalled());
    log.reportError(new ApiError({ status: 404, code: "NOT_FOUND", message: "x", requestId: "r" }));

    expect(client.captureError).not.toHaveBeenCalled();
  });

  it("records replays only without a withdrawn consent", async () => {
    const { sentry, consent } = await load("statistics");

    sentry.installSentry(new QueryClient());
    await vi.waitFor(() => expect(client.setUser).toHaveBeenCalled());
    expect(client.startReplay).not.toHaveBeenCalled();

    consent.startConsent("de");
    expect(client.startReplay).toHaveBeenCalledTimes(1);
  });

  it("loads nothing without a DSN", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    const { installSentry } = await import("@/core/telemetry/sentry");
    const { startSentryClient } = await import("@/core/telemetry/sentryClient");

    installSentry(new QueryClient());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(startSentryClient).not.toHaveBeenCalled();
  });
});
