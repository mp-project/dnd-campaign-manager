import { assetLinksPermissionDefinitions } from "#src/modules/asset-links/permissions/AssetLinksPermissions";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";

const KEYS = [
  "assetLinks.read",
  "assetLinks.create",
  "assetLinks.update",
  "assetLinks.delete",
  "assetLinks.readUsages",
];

describe("asset link permission definitions", () => {
  it("contains the expected keys", () => {
    expect(assetLinksPermissionDefinitions.map((item) => item.key)).toEqual(KEYS);
  });

  it("lets users and administrators reach the routes; the campaign role decides per request", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual(expect.arrayContaining(KEYS));
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(expect.arrayContaining(KEYS));
  });
});
