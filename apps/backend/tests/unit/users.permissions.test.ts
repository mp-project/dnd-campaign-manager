import { usersPermissionDefinitions } from "#src/modules/users/permissions/UsersPermissions";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";

describe("users permission definitions", () => {
  it("contains self-service and admin permissions", () => {
    const keys = usersPermissionDefinitions.map((item) => item.key);

    expect(keys).toEqual([
      "users.readSelf",
      "users.updateSelf",
      "users.read",
      "users.update",
      "users.delete",
      "users.manageRole",
    ]);
  });

  it("keeps admin actions admin-only", () => {
    const userPermissions = ROLE_PERMISSIONS.USER;

    expect(userPermissions).toContain("users.read");
    expect(userPermissions).not.toContain("users.update");
    expect(userPermissions).not.toContain("users.delete");

    expect(ROLE_PERMISSIONS.ADMIN).toContain("users.read");
    expect(ROLE_PERMISSIONS.ADMIN).toContain("users.update");
    expect(ROLE_PERMISSIONS.ADMIN).toContain("users.delete");
  });

  it("restricts users.manageRole to system maintainers", () => {
    expect(ROLE_PERMISSIONS.USER).not.toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain("users.manageRole");
    expect(ROLE_PERMISSIONS.SYSTEM_MAINTAINER).toContain("users.manageRole");
  });
});
