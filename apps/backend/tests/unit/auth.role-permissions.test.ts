import {
  ALL_PERMISSIONS,
  APPLICATION_USER_PERMISSIONS,
  CORE_PERMISSION_KEYS,
} from "#src/modules/auth/permissions/permissions";
import {
  ROLE_PERMISSIONS,
  SYS_ADMIN_COMMON_PERMISSIONS,
} from "#src/modules/auth/permissions/roles";
import { defaultPermissionDefinitions } from "#core/permissions/service";

describe("auth role permission assignments", () => {
  it("uses only known permissions in role assignments", () => {
    const knownPermissions = new Set(ALL_PERMISSIONS);

    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(knownPermissions.has(permission)).toBe(true);
      }
    }
  });

  it("keeps application-user permissions focused on self-service and read access", () => {
    expect(APPLICATION_USER_PERMISSIONS).toEqual(
      expect.arrayContaining([
        "auth.logoutSelf",
        "auth.logoutAllSelf",
        "auth.changePasswordSelf",
        "users.readSelf",
        "users.updateSelf",
        "users.read",
        "rulesets.read",
        "campaigns.create",
        "campaigns.read",
      ]),
    );

    expect(APPLICATION_USER_PERMISSIONS).not.toEqual(
      expect.arrayContaining([
        "users.update",
        "users.delete",
        "users.manageRole",
        "rulesets.create",
        "rulesets.update",
        "rulesets.delete",
        "rulesets.validate",
        "campaigns.update",
        "campaigns.archive",
        "campaigns.advanceTime",
        "campaigns.correctTime",
      ]),
    );
  });

  it("keeps users.manageRole reserved for system maintainer and system", () => {
    expect(ROLE_PERMISSIONS.SYSTEM).toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.SYSTEM_MAINTAINER).toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.USER).not.toContain("users.manageRole");
  });

  it("keeps curated core permission keys in sync with core definitions", () => {
    expect(new Set(CORE_PERMISSION_KEYS)).toEqual(
      new Set(defaultPermissionDefinitions.map((definition) => definition.key)),
    );
  });

  it("keeps common sys-admin permissions centralized", () => {
    expect(SYS_ADMIN_COMMON_PERMISSIONS).toContain("users.read");
    expect(SYS_ADMIN_COMMON_PERMISSIONS).toContain("users.update");
    expect(SYS_ADMIN_COMMON_PERMISSIONS).toContain("users.delete");
    expect(SYS_ADMIN_COMMON_PERMISSIONS).not.toContain("users.manageRole");
  });
});
