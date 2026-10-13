import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";

export type UserReadScope = "FULL" | "LIMITED";

export function resolveUserReadScope(context: RequestContext): UserReadScope {
  return isSysAdminRole(context.systemRole) ? "FULL" : "LIMITED";
}
