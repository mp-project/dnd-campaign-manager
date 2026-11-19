import type { FrontendModule, NavItem } from "@/core/modules";
import { authModule } from "@/modules/auth";
import { campaignsModule } from "@/modules/campaigns";
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { legalModule } from "@/modules/legal";
import { usersModule } from "@/modules/users";

/** Every frontend module of the app; router and navigation are built from this list. */
export const frontendModules: readonly FrontendModule[] = [landingModule, authModule, legalModule, contactModule, campaignsModule, usersModule];

export function navItemsOf(modules: readonly FrontendModule[]): NavItem[] {
  return modules.flatMap((module) => module.nav ?? []);
}
