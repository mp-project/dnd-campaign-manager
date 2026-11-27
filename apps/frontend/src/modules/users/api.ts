import { api, unwrap } from "@/core/api/client";

/** The own account: profile and settings. Sign-in, devices and sessions are Clerk's (`<UserProfile>`). */
export function updateProfile(body: { displayName: string }) {
  return unwrap(api.PATCH("/api/v1/me", { body }));
}

export function updateSettings(body: {
  locale?: string;
  timezone?: string;
  reducedMotion?: boolean;
  fontScale?: number;
  sidebarCollapsed?: boolean;
}) {
  return unwrap(api.PATCH("/api/v1/me/settings", { body }));
}
