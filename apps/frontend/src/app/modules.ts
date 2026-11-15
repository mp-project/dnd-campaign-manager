import type { FrontendModule, NavItem } from "@/core/modules";
import { campaignsModule } from "@/modules/campaigns";

/** Every frontend module of the app; router and navigation are built from this list. */
export const frontendModules: readonly FrontendModule[] = [campaignsModule];

export function navItemsOf(modules: readonly FrontendModule[]): NavItem[] {
  return modules.flatMap((module) => module.nav ?? []);
}
