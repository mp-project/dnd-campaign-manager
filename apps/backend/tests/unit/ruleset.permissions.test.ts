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

  it("limits mutating actions to admins by campaign-role policy", () => {
    const mutating = rulesetPermissionDefinitions.filter((item) =>
      ["rulesets.create", "rulesets.update", "rulesets.delete", "rulesets.validate"].includes(
        item.key,
      ),
    );

    for (const definition of mutating) {
      expect(definition.allowedCampaignRoles).toEqual([]);
    }
  });
});
