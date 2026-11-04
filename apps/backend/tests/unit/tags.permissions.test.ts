import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";
import { tagsPermissionDefinitions } from "#src/modules/tags/permissions/TagsPermissions";

const KEYS = ["tags.read", "tags.create", "tags.update", "tags.delete", "tags.assign"];

describe("tag permission definitions", () => {
  it("contains the expected keys", () => {
    expect(tagsPermissionDefinitions.map((item) => item.key)).toEqual(KEYS);
  });

  it("lets users and administrators reach the routes; the campaign role decides per request", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual(expect.arrayContaining(KEYS));
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(expect.arrayContaining(KEYS));
  });
});
