import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";
import { mediaPermissionDefinitions } from "#src/modules/media/permissions/MediaPermissions";

const KEYS = ["media.read", "media.upload", "media.update", "media.delete", "media.attach"];

describe("media permission definitions", () => {
  it("contains the expected keys", () => {
    expect(mediaPermissionDefinitions.map((item) => item.key)).toEqual(KEYS);
  });

  it("lets users and administrators reach the routes; the campaign role decides per request", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual(expect.arrayContaining(KEYS));
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(expect.arrayContaining(KEYS));
  });
});
