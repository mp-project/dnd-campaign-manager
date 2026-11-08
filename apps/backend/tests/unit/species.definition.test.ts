import { raisesAbilityScore, usesClassLevel } from "#src/modules/features/index";
import {
  CreateSpeciesSchema,
  CreateSpeciesVariantSchema,
} from "#src/modules/species/domain/dto/CreateSpeciesDto";
import {
  AgeProfileSchema,
  MovementModeSchema,
  type SpeciesDefinition,
  SpeciesDefinitionSchema,
  SpeciesFeatureBindingSchema,
  SpeciesFeatureGrantSchema,
  VariantGroupSchema,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import { SpeciesSelectionSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import { UpdateSpeciesSchema } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import {
  collectGrantReferences,
  toPlayerGrants,
  validateFeatureGrants,
  validateSpeciesDefinition,
  validateVariantDefinition,
} from "#src/modules/species/domain/SpeciesDefinition";
import {
  applyGrantOperations,
  collectSelectedGrants,
  getCreationOptions,
  type OfferedVariant,
  validateSpeciesSelection,
} from "#src/modules/species/domain/SpeciesSelection";
import { SpeciesSelectionService } from "#src/modules/species/service/SpeciesSelectionService";

const SPECIES_ASSET = "00000000-0000-4000-8000-0000000000aa";
const DARKVISION = "11111111-1111-4111-8111-111111111111";
const SUPERIOR_DARKVISION = "22222222-2222-4222-8222-222222222222";
const ANCESTRY = "33333333-3333-4333-8333-333333333333";
const DROW_MAGIC = "44444444-4444-4444-8444-444444444444";
const DROW = "55555555-5555-4555-8555-555555555555";
const HIGH = "66666666-6666-4666-8666-666666666666";

const grant = (key: string, featureAssetId: string, extra: Record<string, unknown> = {}) =>
  SpeciesFeatureGrantSchema.parse({ key, featureAssetId, ...extra });

/** A 2024 elf: two sizes are not offered, one lineage is required. */
const elf = (overrides: Partial<Record<keyof SpeciesDefinition, unknown>> = {}): SpeciesDefinition =>
  SpeciesDefinitionSchema.parse({
    sizeOptions: [{ size: "MEDIUM", isDefault: true }],
    movementModes: [{ mode: "WALK", distanceFeet: 30, isBase: true }],
    ageProfile: null,
    physicalProfile: null,
    textSections: [{ key: "names", title: "Elven names", content: "**Ara**" }],
    variantGroups: [
      { code: "lineage", name: "Elven lineage", minimumSelections: 1, maximumSelections: 1, required: true },
    ],
    featureGrants: [grant("darkvision", DARKVISION), grant("ancestry", ANCESTRY)],
    ...overrides,
  });

const settings = { lifespanMode: "RULESET_DEFAULT" as const };

const offered = (overrides: Partial<OfferedVariant> = {}): OfferedVariant => ({
  variantId: "77777777-7777-4777-8777-777777777777",
  assetId: DROW,
  code: "drow",
  name: "Drow",
  summary: null,
  variantGroupCode: "lineage",
  displayOrder: 0,
  selectable: true,
  featureGrants: [
    grant("superior_darkvision", SUPERIOR_DARKVISION, {
      operation: "REPLACE",
      targetFeatureAssetId: DARKVISION,
    }),
    grant("drow_magic", DROW_MAGIC, { minimumCharacterLevel: 3 }),
  ],
  ...overrides,
});

const issueMessages = (issues: { message: string }[]) => issues.map((issue) => issue.message);

describe("species definition", () => {
  describe("size and movement", () => {
    it("accepts one default size and one positive base walking speed", () => {
      expect(validateSpeciesDefinition(settings, elf())).toEqual([]);
    });

    it("rejects repeated sizes and more than one default", () => {
      const issues = validateSpeciesDefinition(
        settings,
        elf({
          sizeOptions: [
            { size: "SMALL", isDefault: true },
            { size: "SMALL", isDefault: true },
          ],
        }),
      );

      expect(issueMessages(issues)).toEqual([
        "Size SMALL is offered more than once",
        "At most one size is the default",
      ]);
    });

    it("needs exactly one base speed, a positive walking speed", () => {
      expect(
        issueMessages(
          validateSpeciesDefinition(
            settings,
            elf({
              movementModes: [
                { mode: "WALK", distanceFeet: 30 },
                { mode: "SWIM", distanceFeet: 30 },
              ],
            }),
          ),
        ),
      ).toEqual(["A species needs exactly one base speed, a positive walking speed"]);

      expect(MovementModeSchema.safeParse({ mode: "FLY", distanceFeet: 30, isBase: true }).success).toBe(false);
      expect(MovementModeSchema.safeParse({ mode: "WALK", distanceFeet: 0, isBase: true }).success).toBe(false);
      expect(MovementModeSchema.safeParse({ mode: "WALK", distanceFeet: null }).success).toBe(false);
    });

    it("lets other speeds equal the walking speed and rejects repeated modes", () => {
      expect(
        issueMessages(
          validateSpeciesDefinition(
            settings,
            elf({
              movementModes: [
                { mode: "WALK", distanceFeet: 30, isBase: true },
                { mode: "CLIMB", distanceFeet: null },
                { mode: "CLIMB", distanceFeet: 20 },
              ],
            }),
          ),
        ),
      ).toEqual(["Movement mode CLIMB is listed more than once"]);
    });

    it("rejects a species without size or movement", () => {
      expect(SpeciesDefinitionSchema.safeParse({ ...elf(), sizeOptions: [] }).success).toBe(false);
      expect(SpeciesDefinitionSchema.safeParse({ ...elf(), movementModes: [] }).success).toBe(false);
    });
  });

  describe("lifespan", () => {
    const profile = (values: Record<string, unknown>) => AgeProfileSchema.parse(values);

    it("needs a lifespan for SPECIES_SPECIFIC and none otherwise", () => {
      const withLifespan = elf({ ageProfile: profile({ adulthoodAge: 100, typicalLifespan: 750 }) });
      const adulthoodOnly = elf({ ageProfile: profile({ adulthoodAge: 18 }) });

      expect(validateSpeciesDefinition({ lifespanMode: "SPECIES_SPECIFIC" }, withLifespan)).toEqual([]);
      expect(issueMessages(validateSpeciesDefinition({ lifespanMode: "SPECIES_SPECIFIC" }, adulthoodOnly))).toEqual([
        "A species-specific lifespan needs a typical or maximum lifespan",
      ]);
      expect(validateSpeciesDefinition({ lifespanMode: "RULESET_DEFAULT" }, adulthoodOnly)).toEqual([]);
      expect(issueMessages(validateSpeciesDefinition({ lifespanMode: "UNSPECIFIED" }, withLifespan))).toEqual([
        "Lifespans are only set with SPECIES_SPECIFIC, not UNSPECIFIED",
      ]);
    });

    it("keeps adulthood, typical and maximum lifespan in order", () => {
      expect(AgeProfileSchema.safeParse({ adulthoodAge: 100, typicalLifespan: 50 }).success).toBe(false);
      expect(AgeProfileSchema.safeParse({ typicalLifespan: 80, maximumLifespan: 120 }).success).toBe(true);
      expect(AgeProfileSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("variant groups", () => {
    it("ties `required` to a minimum of at least one", () => {
      const group = { code: "lineage", name: "Lineage", maximumSelections: 1 };

      expect(VariantGroupSchema.safeParse({ ...group, minimumSelections: 1, required: true }).success).toBe(true);
      expect(VariantGroupSchema.safeParse({ ...group, minimumSelections: 0, required: false }).success).toBe(true);
      expect(VariantGroupSchema.safeParse({ ...group, minimumSelections: 0, required: true }).success).toBe(false);
      expect(VariantGroupSchema.safeParse({ ...group, minimumSelections: 1, required: false }).success).toBe(false);
      expect(
        VariantGroupSchema.safeParse({ ...group, minimumSelections: 2, maximumSelections: 1, required: true }).success,
      ).toBe(false);
    });

    it("rejects repeated group codes and text section keys", () => {
      const lineage = elf().variantGroups[0];
      const issues = validateSpeciesDefinition(
        settings,
        elf({
          variantGroups: [lineage, lineage],
          textSections: [
            { key: "names", title: "A", content: "a" },
            { key: "names", title: "B", content: "b" },
          ],
        }),
      );

      expect(issueMessages(issues)).toEqual([
        "Key 'names' is used more than once",
        "Code 'lineage' is used more than once",
      ]);
    });

    it("checks a variant's group and grants against its species", () => {
      const variant = offered();

      expect(validateVariantDefinition(variant, elf())).toEqual([]);
      expect(issueMessages(validateVariantDefinition({ ...variant, variantGroupCode: "legacy" }, elf()))).toEqual([
        "The species has no variant group 'legacy'",
      ]);
      expect(
        issueMessages(
          validateVariantDefinition(
            { ...variant, featureGrants: [grant("darkvision", SUPERIOR_DARKVISION)] },
            elf(),
          ),
        ),
      ).toEqual(["Key 'darkvision' is already used by the species"]);
    });
  });

  describe("feature grants", () => {
    it("checks the shape of a grant and its bindings", () => {
      expect(SpeciesFeatureGrantSchema.safeParse({ key: "a", featureAssetId: DARKVISION, operation: "UPGRADE" }).success).toBe(false);
      expect(
        SpeciesFeatureGrantSchema.safeParse({ key: "a", featureAssetId: DARKVISION, targetFeatureAssetId: ANCESTRY }).success,
      ).toBe(false);
      expect(
        SpeciesFeatureGrantSchema.safeParse({
          key: "a",
          featureAssetId: DARKVISION,
          operation: "REPLACE",
          targetFeatureAssetId: DARKVISION,
        }).success,
      ).toBe(false);
      expect(
        SpeciesFeatureBindingSchema.safeParse({ parameterKey: "range", bindingSource: "STATIC", staticValue: 60 }).success,
      ).toBe(true);
      expect(
        SpeciesFeatureBindingSchema.safeParse({ parameterKey: "range", bindingSource: "CONTEXT", staticValue: 60 }).success,
      ).toBe(false);
    });

    it("needs targets granted by the species or variant, not later than the replacement", () => {
      const grants = [
        grant("darkvision", DARKVISION, { minimumCharacterLevel: 5 }),
        grant("superior", SUPERIOR_DARKVISION, {
          operation: "UPGRADE",
          targetFeatureAssetId: DARKVISION,
          minimumCharacterLevel: 3,
        }),
        grant("magic", DROW_MAGIC, { operation: "REPLACE", targetFeatureAssetId: ANCESTRY }),
      ];

      expect(issueMessages(validateFeatureGrants(grants, ["featureGrants"]))).toEqual([
        "An upgrade or replacement cannot apply before its target",
        "The target must be a feature granted by the species or this variant",
      ]);
    });

    it("finds cycles of upgrades and replacements", () => {
      const grants = [
        grant("a", DARKVISION, { operation: "REPLACE", targetFeatureAssetId: SUPERIOR_DARKVISION }),
        grant("b", SUPERIOR_DARKVISION, { operation: "REPLACE", targetFeatureAssetId: DARKVISION }),
      ];

      expect(issueMessages(validateFeatureGrants(grants, ["featureGrants"]))).toEqual([
        "Upgrades and replacements form a cycle",
        "Upgrades and replacements form a cycle",
      ]);
    });

    it("rejects unknown context values and repeated keys", () => {
      const grants = [
        grant("a", DARKVISION, {
          bindings: [{ parameterKey: "uses", bindingSource: "CONTEXT", contextKey: "level.unknown" }],
        }),
        grant("a", ANCESTRY),
      ];

      expect(issueMessages(validateFeatureGrants(grants, ["featureGrants"]))).toEqual([
        "Key 'a' is used more than once",
        "Unknown context value 'level.unknown'",
      ]);
    });

    it("lists granted and targeted features as references of type FEATURE", () => {
      expect(collectGrantReferences(offered().featureGrants)).toEqual([
        { assetId: SUPERIOR_DARKVISION, path: ["featureGrants", 0, "featureAssetId"], assetTypes: ["FEATURE"] },
        { assetId: DARKVISION, path: ["featureGrants", 0, "targetFeatureAssetId"], assetTypes: ["FEATURE"] },
        { assetId: DROW_MAGIC, path: ["featureGrants", 1, "featureAssetId"], assetTypes: ["FEATURE"] },
      ]);
    });

    it("leaves hidden features and bound values out of the player view", () => {
      const grants = [
        grant("darkvision", DARKVISION, {
          bindings: [{ parameterKey: "source", bindingSource: "STATIC", staticValue: ANCESTRY }],
        }),
        grant("magic", DROW_MAGIC),
      ];
      const visible = toPlayerGrants(grants, (id) => id === DARKVISION);

      expect(visible.map((item) => item.key)).toEqual(["darkvision"]);
      expect(visible[0]?.bindings).toEqual([]);
    });
  });

  describe("DTOs", () => {
    const create = {
      name: "Elf",
      creatureType: "HUMANOID",
      lifespanMode: "SPECIES_SPECIFIC",
      sizeOptions: [{ size: "MEDIUM" }],
      movementModes: [{ mode: "WALK", distanceFeet: 30, isBase: true }],
      ageProfile: { typicalLifespan: 750 },
    };

    it("creates with defaults and checks the rules across parts", () => {
      expect(CreateSpeciesSchema.parse(create)).toMatchObject({
        status: "ACTIVE",
        releasedToPlayers: false,
        rulesetPolicy: "NEUTRAL",
        displayOrder: 0,
        textSections: [],
        variantGroups: [],
        featureGrants: [],
      });
      expect(CreateSpeciesSchema.safeParse({ ...create, ageProfile: null }).success).toBe(false);
      expect(CreateSpeciesSchema.safeParse({ ...create, campaignId: SPECIES_ASSET }).success).toBe(false);
      expect(CreateSpeciesSchema.safeParse({ ...create, scope: "SYSTEM" }).success).toBe(false);
    });

    it("lets variants target features of the species, which the service checks", () => {
      const variant = {
        name: "Drow",
        variantGroupCode: "lineage",
        featureGrants: [{ key: "superior", featureAssetId: SUPERIOR_DARKVISION, operation: "REPLACE", targetFeatureAssetId: DARKVISION }],
      };

      expect(CreateSpeciesVariantSchema.safeParse(variant).success).toBe(true);
      expect(CreateSpeciesVariantSchema.safeParse({ ...variant, speciesId: SPECIES_ASSET }).success).toBe(false);
    });

    it("needs at least one field besides the versions to update", () => {
      expect(UpdateSpeciesSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
      expect(
        UpdateSpeciesSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, creatureType: "FEY" }).success,
      ).toBe(true);
    });
  });
});

describe("species selection", () => {
  const species = { assetId: SPECIES_ASSET, definition: elf() };
  const high = offered({
    variantId: "88888888-8888-4888-8888-888888888888",
    assetId: HIGH,
    code: "high-elf",
    name: "High Elf",
    featureGrants: [],
  });
  const select = (values: Record<string, unknown>) => SpeciesSelectionSchema.parse(values);

  it("offers sizes and groups, and tells whether a group can be completed", () => {
    const options = getCreationOptions(elf(), [offered({ selectable: false }), high]);

    expect(options.defaultSize).toBe("MEDIUM");
    expect(options.variantGroups[0]).toMatchObject({ code: "lineage", satisfiable: true });
    expect(options.variantGroups[0]?.variants.map((variant) => variant.code)).toEqual(["drow", "high-elf"]);
    expect(getCreationOptions(elf(), [offered({ selectable: false })]).variantGroups[0]?.satisfiable).toBe(false);
  });

  it("accepts a complete selection and takes the default size", () => {
    const result = validateSpeciesSelection(species, [offered(), high], select({ variantAssetIds: [DROW] }));

    expect(result.issues).toEqual([]);
    expect(result.size).toBe("MEDIUM");
    expect(result.chosen.map((variant) => variant.code)).toEqual(["drow"]);
  });

  it("reports missing and surplus variants, foreign ones and sizes not offered", () => {
    const missing = validateSpeciesSelection(species, [offered(), high], select({ size: "SMALL" }));
    const surplus = validateSpeciesSelection(
      species,
      [offered(), high],
      select({ variantAssetIds: [DROW, HIGH, ANCESTRY] }),
    );
    const archived = validateSpeciesSelection(
      species,
      [offered({ selectable: false })],
      select({ variantAssetIds: [DROW] }),
    );

    expect(issueMessages(missing.issues)).toEqual([
      "The species is not offered in size SMALL",
      "Group 'lineage' needs at least 1 variants",
    ]);
    expect(issueMessages(surplus.issues)).toEqual([
      "Not a variant of this species",
      "Group 'lineage' allows at most 1 variants",
    ]);
    expect(issueMessages(archived.issues)).toEqual([
      "Only active variants can be chosen",
      "Group 'lineage' needs at least 1 variants",
    ]);
  });

  it("needs a size when there is no default", () => {
    const twoSizes = {
      assetId: SPECIES_ASSET,
      definition: elf({ sizeOptions: [{ size: "SMALL" }, { size: "MEDIUM" }], variantGroups: [] }),
    };

    expect(issueMessages(validateSpeciesSelection(twoSizes, [], select({})).issues)).toEqual([
      "The species needs a choice of size",
    ]);
    expect(validateSpeciesSelection(twoSizes, [], select({ size: "SMALL" })).issues).toEqual([]);
  });

  it("only takes choices of grants that apply at the level", () => {
    const early = validateSpeciesSelection(
      species,
      [offered()],
      select({
        variantAssetIds: [DROW],
        choices: [{ grantKey: "drow_magic", choiceKey: "ability", values: ["int"] }],
      }),
    );
    const later = validateSpeciesSelection(
      species,
      [offered()],
      select({
        variantAssetIds: [DROW],
        characterLevel: 3,
        choices: [{ grantKey: "drow_magic", choiceKey: "ability", values: ["int"] }],
      }),
    );

    expect(issueMessages(early.issues)).toEqual(["No grant 'drow_magic' applies at this level"]);
    expect(later.issues).toEqual([]);
  });

  it("applies grants by level, replaces the target and locks later ones", () => {
    const grants = collectSelectedGrants(
      { assetId: SPECIES_ASSET, featureGrants: elf().featureGrants },
      [offered()],
    );
    const statusAt = (level: number) =>
      Object.fromEntries(applyGrantOperations(grants, level).map((item) => [item.grant.key, item.status]));

    expect(statusAt(1)).toEqual({
      darkvision: "REPLACED",
      ancestry: "APPLIED",
      superior_darkvision: "APPLIED",
      drow_magic: "LOCKED",
    });
    expect(statusAt(3).drow_magic).toBe("APPLIED");
  });

  it("keeps an upgraded feature, and a later replacement wins over an upgrade", () => {
    const grants = collectSelectedGrants({ assetId: SPECIES_ASSET, featureGrants: [grant("darkvision", DARKVISION)] }, [
      offered({
        featureGrants: [
          grant("better", SUPERIOR_DARKVISION, { operation: "UPGRADE", targetFeatureAssetId: DARKVISION }),
          grant("other", DROW_MAGIC, {
            operation: "REPLACE",
            targetFeatureAssetId: DARKVISION,
            minimumCharacterLevel: 5,
          }),
        ],
      }),
    ]);
    const statusAt = (level: number) => applyGrantOperations(grants, level)[0]?.status;

    expect(statusAt(1)).toBe("UPGRADED");
    expect(statusAt(5)).toBe("REPLACED");
  });
});

describe("review fixes", () => {
  it("keeps grant keys unique across the variants of a species", () => {
    const sibling = { code: "high-elf", featureGrants: [grant("drow_magic", ANCESTRY)] };
    const issues = validateVariantDefinition(
      { variantGroupCode: "lineage", featureGrants: offered().featureGrants },
      elf(),
      [sibling],
    );

    expect(issueMessages(issues)).toEqual(["Key 'drow_magic' is already used by variant 'high-elf'"]);
    expect(
      validateVariantDefinition({ variantGroupCode: "lineage", featureGrants: offered().featureGrants }, elf(), [
        { code: "high-elf", featureGrants: [grant("cantrip", ANCESTRY)] },
      ]),
    ).toEqual([]);
  });

  it("refuses a selection whose chosen variants share a grant key", () => {
    const definition = elf({
      variantGroups: [
        { code: "lineage", name: "Lineage", minimumSelections: 0, maximumSelections: 2, required: false },
      ],
    });
    const other = offered({ assetId: HIGH, code: "high", featureGrants: [grant("drow_magic", ANCESTRY)] });
    const result = validateSpeciesSelection({ assetId: SPECIES_ASSET, definition }, [offered(), other], {
      variantAssetIds: [DROW, HIGH],
      characterLevel: 1,
      choices: [],
    });

    expect(issueMessages(result.issues)).toEqual([
      "Grant key 'drow_magic' is used more than once by the chosen variants",
    ]);
  });

  it("refuses a choice for a hidden grant exactly like one for an unknown grant", () => {
    const row = {
      id: "88888888-8888-4888-8888-888888888888",
      lifespanMode: "RULESET_DEFAULT",
      ...elf(),
    };
    const found = { species: row, asset: { id: SPECIES_ASSET, status: "ACTIVE" } } as never;
    const service = new SpeciesSelectionService({} as never);
    const answer = (grantKey: string) =>
      service.validateSpeciesSelection(
        found,
        [offered()],
        { variantAssetIds: [DROW], characterLevel: 1, choices: [{ grantKey, choiceKey: "pick", values: ["x"] }], actor: {} },
        (assetId) => assetId !== ANCESTRY,
      );

    expect(issueMessages(answer("ancestry").issues)).toEqual(["No grant 'ancestry' applies at this level"]);
    expect(issueMessages(answer("unknown").issues)).toEqual(["No grant 'unknown' applies at this level"]);
    expect(answer("ancestry").definition.featureGrants.map((item) => item.key)).toEqual(["darkvision"]);
  });

  it("drops variants whose stored grants no longer parse from the offer", () => {
    const service = new SpeciesSelectionService({} as never);
    const variant = (code: string, featureGrants: unknown) =>
      ({
        variant: { id: code, code, variantGroupCode: "lineage", displayOrder: 0, featureGrants },
        asset: { id: code, title: code, summary: null, status: "ACTIVE" },
        speciesAssetId: SPECIES_ASSET,
      }) as never;

    expect(
      service
        .offeredVariants([variant("drow", []), variant("broken", [{ bogus: true }])], () => true)
        .map((item) => item.code),
    ).toEqual(["drow"]);
  });

  it("counts MODIFIER and BASE_VALUE on ability scores, in any case, but not the derived modifier", () => {
    const effects = (type: string, stat: string) => ({
      effects: [
        { payload: { type, stat, amount: { type: "CONST", value: 2 }, value: { type: "CONST", value: 19 } } },
      ] as never,
    });

    expect(raisesAbilityScore(effects("MODIFIER", "ability.dex"))).toBe(true);
    expect(raisesAbilityScore(effects("BASE_VALUE", "ability.str"))).toBe(true);
    expect(raisesAbilityScore(effects("MODIFIER", " Ability.STR "))).toBe(true);
    expect(raisesAbilityScore(effects("MODIFIER", "ability.str.modifier"))).toBe(false);
    expect(raisesAbilityScore(effects("ADVANTAGE", "ability.str"))).toBe(false);
  });

  it("does not count a constant penalty as an increase", () => {
    const modifier = (amount: unknown) => ({
      effects: [{ payload: { type: "MODIFIER", stat: "ability.str", amount } }] as never,
    });

    expect(raisesAbilityScore(modifier({ type: "CONST", value: -2 }))).toBe(false);
    expect(raisesAbilityScore(modifier({ type: "CONST", value: 0 }))).toBe(false);
    expect(raisesAbilityScore(modifier({ type: "CONST", value: 1 }))).toBe(true);
    expect(raisesAbilityScore(modifier({ type: "VAR", key: "param.bonus" }))).toBe(true);
  });

  it("finds features that depend on a class level", () => {
    const graph = (overrides: Record<string, unknown>) =>
      ({
        scalingTracks: [],
        resources: [],
        activations: [],
        effects: [],
        ...overrides,
      }) as never;

    expect(usesClassLevel(graph({ scalingTracks: [{ scaleBy: "CLASS_LEVEL" }] }))).toBe(true);
    expect(usesClassLevel(graph({ scalingTracks: [{ scaleBy: "CHARACTER_LEVEL" }] }))).toBe(false);
    expect(
      usesClassLevel(
        graph({ resources: [{ maximumExpression: { type: "VAR", key: "level.class" } }] }),
      ),
    ).toBe(true);
    expect(
      usesClassLevel(
        graph({ resources: [{ maximumExpression: { type: "VAR", key: "level.character" } }] }),
      ),
    ).toBe(false);
  });
});
