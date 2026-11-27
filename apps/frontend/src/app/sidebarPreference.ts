import type { QueryClient } from "@tanstack/vue-query";

import { api, unwrap } from "@/core/api/client";
import { meQuery } from "@/core/auth/session";
import { reportError } from "@/core/log/reportError";
import type { useShellStore } from "@/core/ui/shell";

/** Quick toggles in a row are saved once. */
const SAVE_DELAY_MS = 500;

/**
 * Saves the sidebar's toggle button to the account, so the collapsed sidebar follows it to every
 * device. Only the button counts; the campaign switcher's brief expanding stays local. Without a
 * loaded profile (signed out) nothing is saved; a failed save keeps the local state and is reported.
 */
export function saveSidebarPreference(shell: ReturnType<typeof useShellStore>, queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function save(): Promise<void> {
    const me = queryClient.getQueryData(meQuery.queryKey);
    const collapsed = shell.navCollapsed;
    if (!me || me.settings.sidebarCollapsed === collapsed) return;

    try {
      const updated = await unwrap(api.PATCH("/api/v1/me/settings", { body: { sidebarCollapsed: collapsed } }));
      queryClient.setQueryData(meQuery.queryKey, updated);
    } catch (error) {
      reportError(error, { task: "sidebar.save" });
    }
  }

  return shell.$onAction(({ name, after }) => {
    if (name !== "toggleNavCollapsed") return;
    after(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    });
  });
}
