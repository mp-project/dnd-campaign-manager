import {
  createAssetFactory,
  createCampaignContextFactory,
  createCampaignFactory,
  createMembershipFactory,
  createRequestContextFactory,
  createUserFactory,
} from "#test/helpers/factories";

describe("test factories", () => {
  it("creates minimal fixtures with override support", () => {
    const user = createUserFactory({ systemRole: "ADMIN" });
    const campaign = createCampaignFactory({ ownerUserId: user.id });
    const membership = createMembershipFactory({
      campaignId: campaign.id,
      userId: user.id,
      role: "EDITOR",
    });
    const asset = createAssetFactory({ campaignId: campaign.id });
    const requestContext = createRequestContextFactory({ actorId: user.id });
    const campaignContext = createCampaignContextFactory({
      actorId: user.id,
      campaignId: campaign.id,
      campaignRole: "EDITOR",
    });

    expect(user.systemRole).toBe("ADMIN");
    expect(campaign.ownerUserId).toBe(user.id);
    expect(membership.campaignId).toBe(campaign.id);
    expect(asset.campaignId).toBe(campaign.id);
    expect(requestContext.actorId).toBe(user.id);
    expect(campaignContext.campaignId).toBe(campaign.id);
  });
});
