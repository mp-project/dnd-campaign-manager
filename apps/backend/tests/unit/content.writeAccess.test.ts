import { type ContentWriteAction, decideContentWrite } from "#core/content/writeAccess";
import type { CampaignRole } from "#core/http/requestContext";

const CAMPAIGN = { campaignId: "c" };
const GLOBAL = { campaignId: null };
const EDITING: ContentWriteAction[] = ["EDIT", "CHANGE_LIFECYCLE", "SHARE", "READ_HISTORY", "REVERT"];

describe("decideContentWrite", () => {
  it.each(EDITING)("lets owner and editors %s campaign content, not players", (action) => {
    const decide = (campaignRole: CampaignRole | null) =>
      decideContentWrite({ isAdmin: false, campaignRole }, action, CAMPAIGN);

    expect(decide("OWNER")).toBe("ALLOWED");
    expect(decide("EDITOR")).toBe("ALLOWED");
    expect(decide("PLAYER")).toBe("FORBIDDEN");
    expect(decide(null)).toBe("NOT_FOUND");
  });

  it("leaves restoring versions to the owner", () => {
    const decide = (campaignRole: CampaignRole) =>
      decideContentWrite({ isAdmin: false, campaignRole }, "RESTORE_VERSION", CAMPAIGN);

    expect(decide("OWNER")).toBe("ALLOWED");
    expect(decide("EDITOR")).toBe("FORBIDDEN");
  });

  it("leaves global content to administrators, who may do everything", () => {
    expect(decideContentWrite({ isAdmin: false, campaignRole: "OWNER" }, "EDIT", GLOBAL)).toBe(
      "FORBIDDEN",
    );
    expect(decideContentWrite({ isAdmin: true, campaignRole: null }, "EDIT", GLOBAL)).toBe("ALLOWED");
    expect(
      decideContentWrite({ isAdmin: true, campaignRole: null }, "RESTORE_VERSION", CAMPAIGN),
    ).toBe("ALLOWED");
  });
});
