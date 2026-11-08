import { campaignRoleOf, contentViewOf } from "#core/content/viewer";

describe("content viewer", () => {
  it.each([
    [{ role: "EDITOR", isOwner: true }, "OWNER"],
    [{ role: "EDITOR", isOwner: false }, "EDITOR"],
    [{ role: "PLAYER", isOwner: false }, "PLAYER"],
    [{ role: null, isOwner: false }, null],
    [null, null],
  ] as const)("maps %j to the campaign role %s", (facts, role) => {
    expect(campaignRoleOf(facts)).toBe(role);
  });

  it.each([
    [false, "OWNER", "FULL"],
    [false, "EDITOR", "FULL"],
    [false, "PLAYER", "PLAYER"],
    [true, null, "FULL"],
    [true, "PLAYER", "FULL"],
  ] as const)("gives admin=%s with role %s the %s view", (isAdmin, campaignRole, view) => {
    expect(contentViewOf({ isAdmin, campaignRole })).toBe(view);
  });
});
