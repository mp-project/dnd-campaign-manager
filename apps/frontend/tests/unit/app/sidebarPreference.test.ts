import { QueryClient } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as unknown[]);
vi.mock("@/core/api/client", () => ({
  api: {
    PATCH: async (path: string, init: { body: { sidebarCollapsed: boolean } }) => {
      calls.push({ path, body: init.body });
      return { data: { settings: { sidebarCollapsed: init.body.sidebarCollapsed } } };
    },
  },
  unwrap: async (request: Promise<{ data: unknown }>) => (await request).data,
}));

import { saveSidebarPreference } from "@/app/sidebarPreference";
import { meQuery } from "@/core/auth/session";
import { useShellStore } from "@/core/ui/shell";

describe("saveSidebarPreference", () => {
  let queryClient: QueryClient;
  let shell: ReturnType<typeof useShellStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    queryClient = new QueryClient();
    shell = useShellStore(createPinia());
    shell.setNavCollapsed(false);
    saveSidebarPreference(shell, queryClient);
  });

  afterEach(() => vi.useRealTimers());

  it("saves the toggle button once, after quick toggles settle", async () => {
    queryClient.setQueryData(meQuery.queryKey, { settings: { sidebarCollapsed: false } } as never);

    shell.toggleNavCollapsed();
    shell.toggleNavCollapsed();
    shell.toggleNavCollapsed();
    await vi.advanceTimersByTimeAsync(600);

    expect(calls).toEqual([{ path: "/api/v1/me/settings", body: { sidebarCollapsed: true } }]);
    expect(queryClient.getQueryData(meQuery.queryKey)?.settings.sidebarCollapsed).toBe(true);
  });

  it("saves nothing for other changes, an unchanged state or without a profile", async () => {
    shell.toggleNavCollapsed();
    await vi.advanceTimersByTimeAsync(600);

    queryClient.setQueryData(meQuery.queryKey, { settings: { sidebarCollapsed: true } } as never);
    shell.setNavCollapsed(false);
    shell.toggleNavCollapsed();
    await vi.advanceTimersByTimeAsync(600);

    expect(calls).toEqual([]);
  });
});
