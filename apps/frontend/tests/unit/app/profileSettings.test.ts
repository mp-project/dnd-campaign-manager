import { QueryClient } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyProfileSettings } from "@/app/profileSettings";
import { meQuery } from "@/core/auth/session";
import { createAppI18n } from "@/core/i18n";
import { useReducedMotion } from "@/core/motion/reducedMotion";

vi.mock("@/core/i18n/settings", () => ({ setTimeZone: vi.fn() }));

function profile(reducedMotion: boolean) {
  return { settings: { locale: "de", timezone: "Europe/Berlin", reducedMotion } };
}

describe("applyProfileSettings", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    applyProfileSettings(queryClient, createAppI18n(), { keepLocale: true, after: Promise.resolve() });
  });

  it("applies the user's reduced motion and drops it when the profile is gone", () => {
    const reduced = useReducedMotion();

    queryClient.setQueryData(meQuery.queryKey, profile(true) as never);
    expect(reduced.value).toBe(true);

    queryClient.setQueryData(meQuery.queryKey, profile(false) as never);
    expect(reduced.value).toBe(false);

    queryClient.setQueryData(meQuery.queryKey, profile(true) as never);
    queryClient.clear();
    expect(reduced.value).toBe(false);
  });
});
