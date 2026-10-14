import {
  buildCampaignInvitationAcceptUrl,
  renderCampaignInvitationEmail,
} from "#src/modules/campaign-invitations/email/CampaignInvitationEmailTemplate";

describe("campaign invitation email template", () => {
  it("builds a frontend link with the token in the fragment", () => {
    const url = buildCampaignInvitationAcceptUrl({
      frontendOrigin: "https://app.example.test/",
      token: "one-time-token",
    });

    expect(url).toBe("https://app.example.test/invitations/accept#token=one-time-token");
  });

  it("includes campaign, role, expiry and the accept link", () => {
    const expiresAt = new Date("2026-12-01T00:00:00.000Z");
    const message = renderCampaignInvitationEmail({
      campaignName: "Northern Reach",
      role: "PLAYER",
      expiresAt,
      acceptUrl: "https://app.example.test/invitations/accept#token=one-time-token",
    });

    expect(message.subject).toContain("Northern Reach");
    expect(message.text).toContain("als Spieler");
    expect(message.text).toContain("2026-12-01T00:00:00.000Z");
    expect(message.text).toContain("/invitations/accept#token=one-time-token");
  });
});