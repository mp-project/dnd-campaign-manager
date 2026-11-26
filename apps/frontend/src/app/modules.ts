import type { FrontendModule, NavItem } from "@/core/modules";
import { CORE_REALTIME_HANDLERS, type RealtimeHandler } from "@/core/realtime/handlers";
import { authModule } from "@/modules/auth";
import { campaignInvitationsModule } from "@/modules/campaign-invitations";
import { campaignMembershipsModule } from "@/modules/campaign-memberships";
import { campaignsModule } from "@/modules/campaigns";
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { legalModule } from "@/modules/legal";
import { usersModule } from "@/modules/users";

/** Every frontend module of the app; router and navigation are built from this list. */
export const frontendModules: readonly FrontendModule[] = [landingModule, authModule, legalModule, contactModule, campaignsModule, campaignMembershipsModule, campaignInvitationsModule, usersModule];

export function navItemsOf(modules: readonly FrontendModule[]): NavItem[] {
  return modules.flatMap((module) => module.nav ?? []);
}

export function realtimeHandlersOf(modules: readonly FrontendModule[]): RealtimeHandler[] {
  return [...CORE_REALTIME_HANDLERS, ...modules.flatMap((module) => module.realtime ?? [])];
}
