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

  it("lets users reach reading and lifecycle routes and keeps metadata changes for admins", () => {
    // Whether a user may archive this asset is decided per asset in the use case.
    expect(ROLE_PERMISSIONS.USER).toEqual(
      expect.arrayContaining([
        "assets.read",
        "assets.readCatalog",
        "assets.archive",
        "assets.restore",
      ]),
    );
    expect(ROLE_PERMISSIONS.USER).not.toContain("assets.updateMetadata");

    for (const key of ["assets.updateMetadata", "assets.archive", "assets.restore"]) {
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
