import {
  CreateRulesetSchema,
} from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import {
  RequestRulesetListQuerySchema,
} from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import {
  UpdateRulesetSchema,
} from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";

function buildLevelProgressions() {
  return Array.from({ length: 20 }, (_, index) => ({
    characterLevel: index + 1,
    proficiencyBonus: Math.floor(index / 4) + 2,
    experienceThreshold: index * 1000,
  }));
}

function buildSpellSlots() {
  return [
    { casterLevel: 1, slotLevel: 1, slotCount: 2 },
    { casterLevel: 2, slotLevel: 1, slotCount: 3 },
  ];
}

function buildValidCreatePayload() {
  return {
    code: "DND_5E_2099",
    name: "D&D 5E Future",
    description: "Future edition",
    editionYear: 2099,
    sourceReference: {
      source: "internal",
    },
    licenseCode: "INTERNAL_TEST",
    attribution: "QA",
    levelProgressions: buildLevelProgressions(),
    spellSlotProgressions: buildSpellSlots(),
  };
}

describe("ruleset DTOs", () => {
  it("accepts a valid create payload with exactly 20 levels", () => {
    const parsed = CreateRulesetSchema.parse(buildValidCreatePayload());

    expect(parsed.code).toBe("DND_5E_2099");
    expect(parsed.levelProgressions).toHaveLength(20);
  });

  it("rejects create payloads that do not contain all levels 1..20", () => {
    const payload = buildValidCreatePayload();
    payload.levelProgressions = payload.levelProgressions.slice(0, 19);

    expect(() => CreateRulesetSchema.parse(payload)).toThrow();
  });

  it("rejects empty patch payloads", () => {
    expect(() =>
      UpdateRulesetSchema.parse({
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it("allows only declared list filters", () => {
    expect(() =>
      RequestRulesetListQuerySchema.parse({
        limit: 20,
        unknown: "value",
      }),
    ).toThrow();

    const parsed = RequestRulesetListQuerySchema.parse({
      limit: 10,
      includeArchived: "true",
      code: "DND_5E_2014",
    });

    expect(parsed.includeArchived).toBe(true);
    expect(parsed.limit).toBe(10);
  });
});
