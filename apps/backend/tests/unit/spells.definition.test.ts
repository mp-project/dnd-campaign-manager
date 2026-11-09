import { CreateSpellListSchema, CreateSpellSchema } from "#src/modules/spells/domain/dto/CreateSpellDto";
import { ResolveSpellSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import {
  SpellAreaSchema,
  SpellMaterialSchema,
  SpellTargetSchema,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import { UpdateSpellSchema } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import type { SpellRow } from "#src/modules/spells/domain/repository/SpellsRepository";
import {
  checkSpellChoices,
  resolveSlotLevel,
  resolveSpellCast,
  SpellCastError,
} from "#src/modules/spells/domain/SpellCasting";
import { validateSpellDefinition } from "#src/modules/spells/domain/SpellDefinition";

const LIST_ID = "e0000000-0000-4000-8000-000000000001";

const base = {
  name: "Test",
  level: 1,
  school: "EVOCATION",
  castingTimeType: "ACTION",
  rangeType: "SELF",
  durationType: "INSTANTANEOUS",
  description: "Something happens",
};

const parse = (input: Record<string, unknown>) => CreateSpellSchema.safeParse({ ...base, ...input });

const messages = (input: Record<string, unknown>) => {
  const result = parse(input);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

const fireball = () => {
  const parsed = CreateSpellSchema.parse({
    ...base,
    name: "Fireball",
    level: 3,
    rangeType: "DISTANCE",
    rangeDistance: 150,
    rangeUnit: "FEET",
    componentVerbal: true,
    componentSomatic: true,
    componentMaterial: true,
    materials: [{ description: "Bat guano and sulfur", replaceableByFocus: true }],
    targets: [{ key: "blast", targetType: "AREA", area: { shape: "SPHERE", size: 20, unit: "FEET" } }],
    effects: [
      {
        key: "burn",
        targetKey: "blast",
        resolution: "SAVING_THROW",
        saveAbility: "dex",
        onSave: "HALF",
        payload: {
          type: "DAMAGE",
          damageType: "fire",
          dice: {
            count: { type: "ADD", args: [{ type: "CONST", value: 8 }, { type: "VAR", key: "slot.above" }] },
            faces: 6,
          },
        },
        displayOrder: 0,
      },
    ],
  });

  return { row: { ...parsed, id: "s", isRitual: parsed.isRitual } as unknown as SpellRow, definition: parsed };
};

describe("spell DTOs and rules", () => {
  it("accepts representative spells", () => {
    // Shield: reaction with trigger, timed duration.
    expect(
      parse({
        castingTimeType: "REACTION",
        castingTrigger: "When you are hit",
        durationType: "TIMED",
        durationAmount: 1,
        durationUnit: "ROUND",
      }).success,
    ).toBe(true);
    // Detect Magic: ritual with concentration, ten minutes.
    expect(
      parse({
        isRitual: true,
        requiresConcentration: true,
        durationType: "TIMED",
        durationAmount: 10,
        durationUnit: "MINUTE",
      }).success,
    ).toBe(true);
    // Raise Dead: one hour casting time, consumed costly material.
    expect(
      parse({
        level: 5,
        castingTimeType: "HOUR",
        castingTimeAmount: 1,
        rangeType: "TOUCH",
        componentMaterial: true,
        materials: [{ description: "A diamond", costAmount: 500, currency: "GP", consumed: true }],
      }).success,
    ).toBe(true);
    expect(fireball().definition.level).toBe(3);
  });

  it("checks casting time, range and duration fields", () => {
    expect(messages({ castingTimeType: "REACTION" })).toContain("Reactions, and only they, need a trigger");
    expect(messages({ castingTrigger: "x" })).toContain("Reactions, and only they, need a trigger");
    expect(messages({ castingTimeAmount: 2 })).toContain("Actions, bonus actions and reactions take exactly one");
    expect(messages({ rangeType: "DISTANCE" })).toContain("A distance, and only a distance, needs a value");
    expect(messages({ rangeDistance: 30, rangeUnit: "FEET" })).toContain(
      "A distance, and only a distance, needs a value",
    );
    expect(messages({ durationType: "TIMED" })).toContain("A timed duration, and only it, needs an amount");
    expect(messages({ requiresConcentration: true })).toContain(
      "Instantaneous spells can't require concentration",
    );
    expect(parse({ level: 10 }).success).toBe(false);
    expect(parse({ level: -1 }).success).toBe(false);
  });

  it("keeps cantrips without slots and rituals", () => {
    expect(messages({ level: 0, isRitual: true })).toContain("Cantrips can't be cast as rituals");
    expect(
      messages({
        level: 0,
        scalingTracks: [{ key: "dmg", scaleBy: "SLOT_LEVEL", valueType: "INTEGER", values: [{ minimumLevel: 1, value: 1 }] }],
      }),
    ).toContain("Cantrips use no spell slot; scale them by character level");
    expect(
      messages({
        level: 0,
        effects: [
          {
            key: "x",
            payload: { type: "HEAL", amount: { type: "VAR", key: "slot.level" } },
            displayOrder: 0,
          },
        ],
      }),
    ).toContain("Cantrips use no spell slot, so 'slot.level' is not available");
  });

  it("keeps slot scaling at or above the spell level", () => {
    const track = (minimumLevel: number) => ({
      key: "dmg",
      scaleBy: "SLOT_LEVEL",
      valueType: "INTEGER",
      values: [{ minimumLevel, value: 1 }],
    });

    expect(messages({ level: 3, scalingTracks: [track(2)] })).toContain("Slot levels start at the spell level (3)");
    expect(messages({ level: 3, scalingTracks: [track(10)] })).toContain("Slot levels end at 9");
    expect(parse({ level: 3, scalingTracks: [track(4)] }).success).toBe(true);
  });

  it("checks components and material costs", () => {
    expect(messages({ componentMaterial: true })).toContain("Material components, and only they, list their materials");
    expect(messages({ materials: [{ description: "x" }] })).toContain(
      "Material components, and only they, list their materials",
    );
    expect(SpellMaterialSchema.safeParse({ description: "x", costAmount: 50 }).success).toBe(false);
    expect(
      SpellMaterialSchema.safeParse({ description: "x", costAmount: 50, currency: "GP", replaceableByFocus: true })
        .success,
    ).toBe(false);
    expect(SpellMaterialSchema.safeParse({ description: "x", consumed: true }).success).toBe(false);
    expect(messages({ requirements: [{ type: "SPECIAL" }] })).toContain("A special requirement needs details");
    expect(messages({ requirements: [{ type: "FOCUS" }, { type: "FOCUS" }] })).toContain(
      "Requirement 'FOCUS' is listed more than once",
    );
  });

  it("checks targets and areas", () => {
    expect(SpellTargetSchema.safeParse({ key: "a", targetType: "AREA" }).success).toBe(false);
    expect(
      SpellTargetSchema.safeParse({
        key: "a",
        targetType: "CREATURE",
        area: { shape: "SPHERE", size: 10, unit: "FEET" },
      }).success,
    ).toBe(false);
    expect(SpellTargetSchema.safeParse({ key: "a", targetType: "SELF", maximumCount: 1 }).success).toBe(false);
    expect(
      SpellTargetSchema.safeParse({ key: "a", targetType: "CREATURE", minimumCount: 3, maximumCount: 2 }).success,
    ).toBe(false);
    expect(SpellAreaSchema.safeParse({ shape: "CYLINDER", size: 10, unit: "FEET" }).success).toBe(false);
    expect(SpellAreaSchema.safeParse({ shape: "CYLINDER", size: 10, unit: "FEET", height: 40 }).success).toBe(true);
    expect(SpellAreaSchema.safeParse({ shape: "LINE", size: 100, unit: "FEET", width: 5 }).success).toBe(true);
    expect(SpellAreaSchema.safeParse({ shape: "CUBE", size: 10, unit: "FEET", width: 5 }).success).toBe(false);
  });

  it("checks effects: targets, saves, dependencies, variables and dice", () => {
    const effect = (input: Record<string, unknown>) => ({
      key: "e",
      payload: { type: "INFORMATION", message: "x" },
      displayOrder: 0,
      ...input,
    });

    expect(messages({ effects: [effect({ targetKey: "nobody" })] })).toContain("Unknown target 'nobody'");
    expect(messages({ effects: [effect({ resolution: "SAVING_THROW" })] })).toContain(
      "Saving throws, and only they, name an ability",
    );
    expect(messages({ effects: [effect({ dependsOnEffectKeys: ["e"] })] })).toContain(
      "An effect cannot depend on itself",
    );
    expect(
      messages({
        effects: [effect({ key: "a", dependsOnEffectKeys: ["b"] }), effect({ key: "b", dependsOnEffectKeys: ["a"] })],
      }),
    ).toContain("Effect dependencies form a cycle");
    expect(
      messages({
        effects: [effect({ payload: { type: "HEAL", amount: { type: "VAR", key: "param.x" } } })],
      }),
    ).toContain("Unknown variable 'param.x'");
    expect(
      messages({
        effects: [effect({ payload: { type: "DAMAGE", damageType: "fire", dice: { ref: "scale.none" } } })],
      }),
    ).toContain("Unknown dice 'scale.none'");
    expect(messages({ description: null })).toContain("A spell needs a description, a section or an effect");
    expect(messages({ effects: [effect({}), effect({})] })).toContain("Key 'e' is used more than once");
  });

  it("validates the merged state the same way", () => {
    const { definition } = fireball();

    expect(validateSpellDefinition({ ...definition, level: 0 })).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("slot.above") })]),
    );
  });

  it("derives updates and lists from the base schema", () => {
    expect(UpdateSpellSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
    expect(UpdateSpellSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, level: 2 }).success).toBe(true);
    expect(UpdateSpellSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, campaignId: LIST_ID }).success).toBe(
      false,
    );
    expect(parse({ spellListIds: [LIST_ID, LIST_ID] }).success).toBe(false);
    expect(CreateSpellListSchema.safeParse({ name: "Wizard", spellIds: [LIST_ID, LIST_ID] }).success).toBe(false);
    expect(CreateSpellListSchema.parse({ name: "Wizard" })).toMatchObject({ spellIds: [], status: "ACTIVE" });
  });
});

describe("spell casting", () => {
  it("resolves the slot: none for cantrips, at least the spell level otherwise", () => {
    expect(resolveSlotLevel(0, null)).toBeNull();
    expect(resolveSlotLevel(3, null)).toBe(3);
    expect(resolveSlotLevel(3, 5)).toBe(5);
    expect(() => resolveSlotLevel(3, 2)).toThrow(SpellCastError);
    expect(() => resolveSlotLevel(0, 1)).toThrow(SpellCastError);
    expect(ResolveSpellSchema.safeParse({ slotLevel: 10 }).success).toBe(false);
  });

  it("upcasts with slot.above and reports what the cast would use", () => {
    const { row, definition } = fireball();
    const cast = resolveSpellCast(row, definition, {
      characterLevel: 5,
      slotLevel: 5,
      caster: { saveDc: 15 },
      choices: {},
    });

    expect(cast.effects[0]?.payload).toEqual({
      type: "DAMAGE",
      damageType: "fire",
      dice: { count: 10, faces: 6 },
      amount: null,
    });
    expect(cast.uses).toEqual({
      slotLevel: 5,
      canBeCastAsRitual: false,
      startsConcentration: false,
      consumedMaterials: [],
    });
    expect(cast.caster).toEqual({ attackBonus: null, saveDc: 15 });
  });

  it("scales cantrip dice by character level and reports missing caster values", () => {
    const parsed = CreateSpellSchema.parse({
      ...base,
      level: 0,
      scalingTracks: [
        {
          key: "dmg",
          scaleBy: "CHARACTER_LEVEL",
          valueType: "DIE",
          values: [
            { minimumLevel: 1, value: { count: 1, faces: 8 } },
            { minimumLevel: 5, value: { count: 2, faces: 8 } },
          ],
        },
      ],
      effects: [
        {
          key: "hit",
          payload: { type: "DAMAGE", damageType: "radiant", dice: { ref: "scale.dmg" }, amount: { type: "VAR", key: "caster.modifier" } },
          condition: { type: "COMPARE", operator: "GTE", left: { type: "VAR", key: "level.character" }, right: { type: "CONST", value: 3 } },
          displayOrder: 0,
        },
      ],
    });
    const row = { ...parsed, id: "s" } as unknown as SpellRow;
    const low = resolveSpellCast(row, parsed, { characterLevel: 1, slotLevel: null, caster: {}, choices: {} });
    const high = resolveSpellCast(row, parsed, { characterLevel: 6, slotLevel: null, caster: { modifier: 3 }, choices: {} });

    expect(low.effects[0]).toMatchObject({ applies: "FALSE", payload: { dice: { count: 1, faces: 8 }, amount: null } });
    expect(low.effects[0]?.reasons.length).toBeGreaterThan(0);
    expect(high.effects[0]).toMatchObject({ applies: "TRUE", payload: { dice: { count: 2, faces: 8 }, amount: 3 } });
    expect(high.scaling).toEqual([
      expect.objectContaining({ key: "dmg", atLevel: 6, value: { count: 2, faces: 8 } }),
    ]);
  });

  it("checks answers to choices", () => {
    const choices = [
      {
        key: "element",
        label: "Element",
        choiceType: "DAMAGE_TYPE" as const,
        minimumSelections: 1,
        maximumSelections: 1,
        optionFilter: null,
        displayOrder: 0,
        options: [
          { code: "fire", label: "Fire", linkedAssetId: null },
          { code: "hidden", label: "Hidden", linkedAssetId: LIST_ID },
        ],
      },
    ];

    expect(checkSpellChoices(choices, { element: ["fire"] }, () => true)).toEqual({ element: ["fire"] });
    expect(() => checkSpellChoices(choices, {}, () => true)).toThrow("needs 1 to 1 selections");
    expect(() => checkSpellChoices(choices, { element: ["cold"] }, () => true)).toThrow("has no option 'cold'");
    expect(() => checkSpellChoices(choices, { element: ["hidden"] }, () => false)).toThrow("has no option");
    expect(() => checkSpellChoices(choices, { other: ["x"], element: ["fire"] }, () => true)).toThrow(
      "Unknown choice 'other'",
    );
  });
});
