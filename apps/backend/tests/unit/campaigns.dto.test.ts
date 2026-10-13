import { CreateCampaignSchema } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import { UpdateCampaignSchema } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { AdvanceCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/AdvanceCampaignTimeDto";
import { CorrectCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";

describe("campaigns DTOs", () => {
  it("accepts a valid create payload", () => {
    const parsed = CreateCampaignSchema.parse({
      createdBy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "The Northern Reach",
      slug: "the-northern-reach",
      description: "A grim frontier campaign",
      rulesetId: "11111111-1111-4111-8111-111111111111",
      settings: {
        visibility: "private",
      },
    });

    expect(parsed.slug).toBe("the-northern-reach");
  });

  it("rejects empty patch payloads", () => {
    expect(() =>
      UpdateCampaignSchema.parse({
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it("requires a positive delta for advance time", () => {
    expect(() =>
      AdvanceCampaignTimeSchema.parse({
        days: 0,
        longRests: 0,
      }),
    ).toThrow();

    const parsed = AdvanceCampaignTimeSchema.parse({
      days: 2,
      longRests: 0,
    });

    expect(parsed.days).toBe(2);
  });

  it("requires reason on correction", () => {
    expect(() =>
      CorrectCampaignTimeSchema.parse({
        gameDay: 10,
        longRestCount: 2,
        reason: "",
      }),
    ).toThrow();
  });
});
