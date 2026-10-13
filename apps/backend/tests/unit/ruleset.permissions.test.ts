import { rulesetPermissionDefinitions } from "#src/modules/ruleset/permissions/RulesetPermissions";

describe("ruleset permission definitions", () => {
  it("contains read and admin action permissions", () => {
    const keys = rulesetPermissionDefinitions.map((item) => item.key);

    expect(keys).toEqual([
      "rulesets.read",
      "rulesets.create",
      "rulesets.update",
      "rulesets.delete",
      "rulesets.validate",
    ]);
  });

  it("does not use campaign-role metadata", () => {
    for (const definition of rulesetPermissionDefinitions) {
      expect("allowedCampaignRoles" in definition).toBe(false);
    }
  });
});
