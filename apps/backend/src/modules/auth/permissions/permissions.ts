import { defaultPermissionDefinitions } from "#core/permissions/service";
import {
  AUTH_PERMISSION_KEYS,
} from "#src/modules/auth/permissions/AuthPermissions";
import {
  RULESET_PERMISSION_KEYS,
  RULESET_READ_PERMISSION_KEYS,
} from "#src/modules/ruleset/permissions/RulesetPermissions";
import {
  USERS_PERMISSION_KEYS,
  USERS_SELF_SERVICE_PERMISSION_KEYS,
} from "#src/modules/users/permissions/UsersPermissions";

export type Permission = string;

const corePermissionKeys = defaultPermissionDefinitions.map((definition) => definition.key);

export const APPLICATION_USER_PERMISSIONS: readonly Permission[] = [
  ...AUTH_PERMISSION_KEYS,
  ...USERS_SELF_SERVICE_PERMISSION_KEYS,
  ...RULESET_READ_PERMISSION_KEYS,
];

export const ALL_PERMISSIONS: readonly Permission[] = Array.from(
  new Set<Permission>([
    ...corePermissionKeys,
    ...AUTH_PERMISSION_KEYS,
    ...USERS_PERMISSION_KEYS,
    ...RULESET_PERMISSION_KEYS,
  ]),
);
