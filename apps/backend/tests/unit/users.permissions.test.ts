import { usersPermissionDefinitions } from "#src/modules/users/permissions/UsersPermissions";

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
    const adminOnly = usersPermissionDefinitions.filter((item) =>
      ["users.read", "users.update", "users.delete"].includes(item.key),
    );

    for (const definition of adminOnly) {
      expect(definition.allowedSystemRoles).toEqual(["SUPER_ADMIN", "ADMIN"]);
      expect(definition.allowedCampaignRoles).toEqual([]);
    }
  });

  it("restricts users.manageRole to super admins", () => {
    const manageRole = usersPermissionDefinitions.find(
      (item) => item.key === "users.manageRole",
    );

    expect(manageRole?.allowedSystemRoles).toEqual(["SUPER_ADMIN"]);
    expect(manageRole?.allowedCampaignRoles).toEqual([]);
  });
});
