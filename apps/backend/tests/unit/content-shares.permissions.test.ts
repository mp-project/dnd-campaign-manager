import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";
import { contentSharesPermissionDefinitions } from "#src/modules/content-shares/permissions/ContentSharesPermissions";

const KEYS = [
  "contentShares.read",
  "contentShares.create",
  "contentShares.update",
  "contentShares.revoke",
];

describe("content share permission definitions", () => {
  it("contains the expected keys", () => {
    expect(contentSharesPermissionDefinitions.map((item) => item.key)).toEqual(KEYS);
  });

  it("lets users and administrators reach the routes; the campaign role decides per request", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual(expect.arrayContaining(KEYS));
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(expect.arrayContaining(KEYS));
  });
});
