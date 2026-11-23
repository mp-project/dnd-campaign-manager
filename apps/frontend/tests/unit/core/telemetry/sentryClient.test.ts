import { describe, expect, it, vi } from "vitest";

const { init } = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@sentry/vue", () => ({
  init,
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
  logger: {},
}));

import { startSentryClient } from "@/core/telemetry/sentryClient";

describe("Sentry client", () => {
  it("leaves out the integrations whose errors reach Sentry through reportError", () => {
    startSentryClient({
      dsn: "https://key@example.ingest.sentry.io/1",
      environment: "test",
      release: "test",
      replaySessionSampleRate: 0,
      replayOnErrorSampleRate: 0,
    });

    const { integrations } = init.mock.calls[0]![0] as {
      integrations: (defaults: { name: string }[]) => { name: string }[];
    };
    const names = ["GlobalHandlers", "Console", "Vue", "Breadcrumbs", "Dedupe"].map((name) => ({ name }));

    expect(integrations(names).map(({ name }) => name)).toEqual(["Breadcrumbs", "Dedupe"]);
  });
});
