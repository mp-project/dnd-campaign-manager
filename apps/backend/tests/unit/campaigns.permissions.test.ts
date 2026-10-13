import { campaignsPermissionDefinitions } from "#src/modules/campaigns/permissions/CampaignsPermissions";

describe("campaigns permission definitions", () => {
  it("contains expected campaign permission keys", () => {
    const keys = campaignsPermissionDefinitions.map((item) => item.key);

    expect(keys).toEqual([
      "campaigns.create",
      "campaigns.read",
      "campaigns.update",
      "campaigns.archive",
      "campaigns.advanceTime",
      "campaigns.correctTime",
    ]);
  });

  it("does not use campaign-role metadata", () => {
    for (const definition of campaignsPermissionDefinitions) {
      expect("allowedCampaignRoles" in definition).toBe(false);
    }
  });
});
