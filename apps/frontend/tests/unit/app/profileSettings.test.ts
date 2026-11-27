import { QueryClient } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyProfileSettings } from "@/app/profileSettings";
import { meQuery } from "@/core/auth/session";
import { createAppI18n } from "@/core/i18n";
import { useReducedMotion } from "@/core/motion/reducedMotion";

vi.mock("@/core/i18n/settings", () => ({ setTimeZone: vi.fn() }));

function profile(settings: { reducedMotion?: boolean; fontScale?: number; sidebarCollapsed?: boolean } = {}) {
  return {
    settings: {
      locale: "de",
      timezone: "Europe/Berlin",
      reducedMotion: false,
      fontScale: 100,
      sidebarCollapsed: false,
      ...settings,
    },
  };
}

describe("applyProfileSettings", () => {
  let queryClient: QueryClient;
  let setNavCollapsed: ReturnType<typeof vi.fn<(collapsed: boolean) => void>>;

  beforeEach(() => {
    queryClient = new QueryClient();
    setNavCollapsed = vi.fn<(collapsed: boolean) => void>();
    document.documentElement.style.fontSize = "";
    applyProfileSettings(queryClient, createAppI18n(), {
      keepLocale: true,
      after: Promise.resolve(),
      setNavCollapsed,
    });
  });

  it("applies the user's reduced motion and drops it when the profile is gone", () => {
    const reduced = useReducedMotion();

    queryClient.setQueryData(meQuery.queryKey, profile({ reducedMotion: true }) as never);
    expect(reduced.value).toBe(true);

    queryClient.setQueryData(meQuery.queryKey, profile({ reducedMotion: false }) as never);
    expect(reduced.value).toBe(false);

    queryClient.setQueryData(meQuery.queryKey, profile({ reducedMotion: true }) as never);
    queryClient.clear();
    expect(reduced.value).toBe(false);
  });

  it("scales the text by the account's setting and back to the browser's when the profile is gone", () => {
    queryClient.setQueryData(meQuery.queryKey, profile({ fontScale: 115 }) as never);
    expect(document.documentElement.style.fontSize).toBe("115%");

    queryClient.setQueryData(meQuery.queryKey, profile({ fontScale: 100 }) as never);
    expect(document.documentElement.style.fontSize).toBe("");

    queryClient.setQueryData(meQuery.queryKey, profile({ fontScale: 90 }) as never);
    queryClient.clear();
    expect(document.documentElement.style.fontSize).toBe("");
  });

  it("applies the account's sidebar only when that setting changes", () => {
    queryClient.setQueryData(meQuery.queryKey, profile({ sidebarCollapsed: true }) as never);
    queryClient.setQueryData(meQuery.queryKey, profile({ sidebarCollapsed: true, reducedMotion: true }) as never);
    queryClient.setQueryData(meQuery.queryKey, profile({ sidebarCollapsed: false }) as never);

    expect(setNavCollapsed.mock.calls).toEqual([[true], [false]]);
  });
});
