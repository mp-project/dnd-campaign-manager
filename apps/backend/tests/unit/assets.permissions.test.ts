import { PermissionService } from "#core/permissions/service";
import { createCampaignContextFactory } from "#test/helpers/factories";
import { assetsPermissionDefinitions } from "#src/modules/assets/permissions/AssetsPermissions";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";

describe("assets permission definitions", () => {
  it("contains expected asset permission keys", () => {
    expect(assetsPermissionDefinitions.map((item) => item.key)).toEqual([
      "assets.read",
      "assets.updateMetadata",
      "assets.archive",
      "assets.restore",
      "assets.readCatalog",
    ]);
  });

  it("grants users read access only and keeps lifecycle actions for admins", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual(
      expect.arrayContaining(["assets.read", "assets.readCatalog"]),
    );

    for (const key of ["assets.updateMetadata", "assets.archive", "assets.restore"]) {
      expect(ROLE_PERMISSIONS.USER).not.toContain(key);
      expect(ROLE_PERMISSIONS.ADMIN).toContain(key);
    }
  });

  it("evaluates role assignments through the permission service", () => {
    const service = new PermissionService();
    service.registerDefinitions("assets", assetsPermissionDefinitions);
    service.registerSystemRolePermissions(ROLE_PERMISSIONS);

    const user = createCampaignContextFactory({ systemRole: "USER" });
    const admin = createCampaignContextFactory({ systemRole: "ADMIN" });

    expect(service.can("assets.read", user)).toBe(true);
    expect(service.can("assets.updateMetadata", user)).toBe(false);
    expect(service.can("assets.updateMetadata", admin)).toBe(true);
  });
});
