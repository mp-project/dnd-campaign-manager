import {
  ALL_PERMISSIONS,
  APPLICATION_USER_PERMISSIONS,
} from "#src/modules/auth/permissions/permissions";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";

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
        "rulesets.read",
      ]),
    );

    expect(APPLICATION_USER_PERMISSIONS).not.toEqual(
      expect.arrayContaining([
        "users.read",
        "users.update",
        "users.delete",
        "users.manageRole",
        "rulesets.create",
        "rulesets.update",
        "rulesets.delete",
        "rulesets.validate",
      ]),
    );
  });

  it("keeps users.manageRole reserved for super admin and system", () => {
    expect(ROLE_PERMISSIONS.SYSTEM).toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.USER).not.toContain("users.manageRole");
  });
});
