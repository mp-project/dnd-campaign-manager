import { averageOfFormula, computeStatBlock, type StatBlockItem } from "#src/modules/actors/domain/ActorStatBlock";
import {
  type ActorParts,
  ActorPartsSchema,
  DEFAULT_ACTOR_PARTS,
} from "#src/modules/actors/domain/dto/ActorPartsDto";
import { CreateActorSchema } from "#src/modules/actors/domain/dto/CreateActorDto";
import { UpdateActorSchema } from "#src/modules/actors/domain/dto/UpdateActorDto";
import type { ResolvedItem } from "#src/modules/items/index";

const scores = (values: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>) =>
  Object.fromEntries(
    (["str", "dex", "con", "int", "wis", "cha"] as const).map((ability) => [
      ability,
      { ...DEFAULT_ACTOR_PARTS.abilities[ability], score: values[ability] ?? 10 },
    ]),
  ) as ActorParts["abilities"];

const parts = (overrides: Partial<ActorParts> = {}): ActorParts =>
  ActorPartsSchema.parse({ ...DEFAULT_ACTOR_PARTS, ...overrides });

/** A resolved item with nothing in it; tests fill in what they need. */
const emptyResolution = (): ResolvedItem =>
  ({
    state: { carried: true, equipped: true, attuned: false, functional: true, chargesCurrent: null, chargesMaximum: null },
    weapon: null,
    armor: null,
    effects: [],
    totals: { modifiers: {}, baseValues: {}, grants: [], advantages: [] },
    spells: [],
    featureGrants: [],
    reasons: [],
  }) as unknown as ResolvedItem;

const item = (resolve: StatBlockItem["resolve"], overrides: Partial<StatBlockItem> = {}): StatBlockItem => ({
  instanceId: "11111111-1111-4111-8111-111111111111",
  itemAssetId: "22222222-2222-4222-8222-222222222222",
  name: "Item",
  quantity: 1,
  equipped: true,
  attuned: false,
  resolve,
  ...overrides,
});

describe("actor parts", () => {
  it("needs all six abilities", () => {
    const five = Object.fromEntries(
      Object.entries(DEFAULT_ACTOR_PARTS.abilities).filter(([ability]) => ability !== "cha"),
    );

    expect(ActorPartsSchema.safeParse({ ...DEFAULT_ACTOR_PARTS, abilities: five }).success).toBe(false);
  });

  it("asks for a reason when an override replaces a computed value", () => {
    const abilities = scores({});

    expect(
      ActorPartsSchema.safeParse({
        ...DEFAULT_ACTOR_PARTS,
        abilities: { ...abilities, str: { ...abilities.str, scoreOverride: 19 } },
      }).success,
    ).toBe(false);
    expect(
      ActorPartsSchema.safeParse({
        ...DEFAULT_ACTOR_PARTS,
        abilities: { ...abilities, str: { ...abilities.str, scoreOverride: 19, overrideReason: "Curse" } },
      }).success,
    ).toBe(true);
    expect(
      ActorPartsSchema.safeParse({ ...DEFAULT_ACTOR_PARTS, skills: [{ skill: "stealth", bonusOverride: 9 }] }).success,
    ).toBe(false);
  });

  it("checks defense targets, hovering, legendary costs and unique entries", () => {
    const valid = (patch: Partial<Record<keyof ActorParts, unknown>>) =>
      ActorPartsSchema.safeParse({ ...DEFAULT_ACTOR_PARTS, ...patch }).success;

    expect(valid({ defenses: [{ type: "RESISTANCE", target: "FIRE" }] })).toBe(true);
    expect(valid({ defenses: [{ type: "RESISTANCE", target: "POISONED" }] })).toBe(false);
    expect(valid({ defenses: [{ type: "CONDITION_IMMUNITY", target: "POISONED" }] })).toBe(true);
    expect(valid({ speeds: [{ mode: "WALK", distanceFeet: 30, hover: true }] })).toBe(false);
    expect(valid({ speeds: [{ mode: "WALK", distanceFeet: 30 }, { mode: "WALK", distanceFeet: 20 }] })).toBe(false);
    expect(
      valid({ traits: [{ key: "bite", kind: "ACTION", name: "Bite", description: "Bites.", legendaryCost: 2 }] }),
    ).toBe(false);
    expect(
      valid({ proficiencies: [{ type: "TOOL", code: "thieves-tools", itemAssetId: "22222222-2222-4222-8222-222222222222" }] }),
    ).toBe(false);
  });

  it("keeps carried loot unique and checks quantity expressions", () => {
    const carried = { key: "a", kind: "CARRIED_ITEM", itemInstanceId: "11111111-1111-4111-8111-111111111111" };

    expect(ActorPartsSchema.safeParse({ ...DEFAULT_ACTOR_PARTS, loot: [carried, { ...carried, key: "b" }] }).success).toBe(false);
    expect(
      ActorPartsSchema.safeParse({
        ...DEFAULT_ACTOR_PARTS,
        loot: [{ key: "coins", kind: "CURRENCY", currency: "GP", amount: "3d6 x 10" }],
      }).success,
    ).toBe(true);
    expect(
      ActorPartsSchema.safeParse({
        ...DEFAULT_ACTOR_PARTS,
        loot: [{ key: "coins", kind: "CURRENCY", currency: "GP", amount: "a lot" }],
      }).success,
    ).toBe(false);
  });

  it("creates with a category only and refuses empty updates and fields set by the server", () => {
    expect(CreateActorSchema.safeParse({ name: "Mira", category: "NPC" }).success).toBe(true);
    expect(CreateActorSchema.safeParse({ name: "Mira" }).success).toBe(false);
    expect(CreateActorSchema.safeParse({ name: "Mira", category: "NPC", campaignId: "c" }).success).toBe(false);
    expect(UpdateActorSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
    expect(
      UpdateActorSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, category: "PLAYER_CHARACTER" }).success,
    ).toBe(true);
  });
});

describe("actor stat block", () => {
  it("computes modifiers, saving throws, skills and passive perception from the base values", () => {
    const abilities = scores({ str: 8, dex: 16, wis: 14 });
    const block = computeStatBlock(
      parts({
        abilities: { ...abilities, dex: { ...abilities.dex, savingThrowProficient: true } },
        skills: [
          { skill: "stealth", proficiency: "EXPERTISE", ability: null, bonusOverride: null, overrideReason: null },
          { skill: "perception", proficiency: "PROFICIENT", ability: null, bonusOverride: null, overrideReason: null },
          { skill: "athletics", proficiency: "HALF", ability: null, bonusOverride: null, overrideReason: null },
        ],
        combat: { ...DEFAULT_ACTOR_PARTS.combat, proficiencyBonus: 3 },
      }),
      [],
    );
    const ability = (name: string) => block.abilities.find((entry) => entry.ability === name);
    const skill = (name: string) => block.skills.find((entry) => entry.skill === name);

    expect(ability("str")).toMatchObject({ score: 8, modifier: -1, savingThrow: { bonus: -1 } });
    expect(ability("dex")).toMatchObject({ score: 16, modifier: 3, savingThrow: { proficient: true, bonus: 6 } });
    expect(skill("stealth")).toMatchObject({ ability: "dex", bonus: 9 });
    expect(skill("perception")).toMatchObject({ bonus: 5 });
    expect(skill("athletics")).toMatchObject({ bonus: 0 });
    expect(skill("arcana")).toMatchObject({ proficiency: "NONE", bonus: 0 });
    expect(block.skills).toHaveLength(18);
    expect(block.passivePerception).toBe(15);
    expect(block.armorClass).toMatchObject({ value: 13, source: "CALCULATED", base: 13 });
    expect(block.initiative).toEqual({ bonus: 3, source: "CALCULATED" });
    expect(block.reasons).toEqual([expect.stringContaining("No hit points")]);
  });

  it("leaves proficient bonuses open without a proficiency bonus and says why", () => {
    const abilities = scores({});
    const block = computeStatBlock(
      parts({ abilities: { ...abilities, con: { ...abilities.con, savingThrowProficient: true } } }),
      [],
    );

    expect(block.abilities.find((entry) => entry.ability === "con")?.savingThrow.bonus).toBeNull();
    expect(block.abilities.find((entry) => entry.ability === "str")?.savingThrow.bonus).toBe(0);
    expect(block.reasons).toContain("No proficiency bonus: set one in the combat values (class levels come later)");
  });

  it("takes values the actor sets and overrides as they are", () => {
    const abilities = scores({ dex: 14 });
    const block = computeStatBlock(
      parts({
        abilities: { ...abilities, str: { ...abilities.str, scoreOverride: 21, overrideReason: "Giant strength" } },
        combat: {
          armorClass: 17,
          armorClassNote: "natural armor",
          hitPointMaximum: null,
          hitPointFormula: "7d8 + 14",
          initiativeBonus: 5,
          proficiencyBonus: 2,
        },
      }),
      [],
    );

    expect(block.abilities.find((entry) => entry.ability === "str")).toMatchObject({
      score: 21,
      scoreSource: "OVERRIDE",
      modifier: 5,
      overrideReason: "Giant strength",
    });
    expect(block.armorClass).toMatchObject({ value: 17, source: "SET", note: "natural armor" });
    expect(block.hitPoints).toEqual({ maximum: 45, formula: "7d8 + 14", source: "CALCULATED" });
    expect(block.initiative).toEqual({ bonus: 5, source: "SET" });
  });

  it("averages hit dice like printed stat blocks", () => {
    expect(averageOfFormula("2d6")).toBe(7);
    expect(averageOfFormula("7d8 + 14")).toBe(45);
    expect(averageOfFormula("1d4 - 3")).toBe(1);
    expect(averageOfFormula("lots")).toBeNull();
  });

  it("adds items: ability scores first, then armor, shields, modifiers and weapon attacks", () => {
    const seen: number[] = [];
    const belt = item((actor) => {
      seen.push(actor.abilities?.str ?? 0);

      return {
        ...emptyResolution(),
        totals: { modifiers: { "ability.STR": 2, ac: 1 }, baseValues: {}, grants: [], advantages: [] },
      } as ResolvedItem;
    });
    const armor = item(
      (actor) =>
        ({
          ...emptyResolution(),
          armor: {
            armorClass: 15 + Math.min(2, Math.floor(((actor.abilities?.dex ?? 10) - 10) / 2)),
            armorClassBonus: null,
            active: true,
          },
        }) as unknown as ResolvedItem,
      { instanceId: "33333333-3333-4333-8333-333333333333", name: "Half Plate" },
    );
    const shield = item(
      () => ({ ...emptyResolution(), armor: { armorClass: null, armorClassBonus: 2, active: true } }) as unknown as ResolvedItem,
      { instanceId: "44444444-4444-4444-8444-444444444444", name: "Shield" },
    );
    const sword = item(
      (actor) =>
        ({
          ...emptyResolution(),
          weapon: {
            combatType: "MELEE",
            properties: [],
            attackBonus: Math.floor(((actor.abilities?.str ?? 10) - 10) / 2) + (actor.proficiencyBonus ?? 0),
            damage: { dice: { count: 1, faces: 8 }, bonus: Math.floor(((actor.abilities?.str ?? 10) - 10) / 2), damageType: "SLASHING" },
            range: null,
            reasons: [],
          },
        }) as unknown as ResolvedItem,
      { instanceId: "55555555-5555-4555-8555-555555555555", name: "Longsword" },
    );
    const block = computeStatBlock(
      parts({ abilities: scores({ str: 14, dex: 16 }), combat: { ...DEFAULT_ACTOR_PARTS.combat, proficiencyBonus: 2 } }),
      [belt, armor, shield, sword],
    );

    // First pass with the base score, second with the raised one.
    expect(seen).toEqual([14, 16]);
    expect(block.abilities.find((entry) => entry.ability === "str")).toMatchObject({ baseScore: 14, score: 16, modifier: 3 });
    expect(block.armorClass).toMatchObject({
      value: 20,
      base: 17,
      shieldBonus: 2,
      modifiers: 1,
      armorInstanceId: "33333333-3333-4333-8333-333333333333",
    });
    expect(block.attacks).toEqual([
      expect.objectContaining({ source: "ITEM", name: "Longsword", attackBonus: 5, reachFeet: 5 }),
    ]);
    expect(block.attacks[0]?.damage).toEqual([{ diceCount: 1, diceFaces: 8, bonus: 3, damageType: "SLASHING" }]);
  });

  it("lists attacks of written actions next to item attacks", () => {
    const block = computeStatBlock(
      parts({
        traits: [
          {
            key: "bite",
            kind: "ACTION",
            name: "Bite",
            description: "Melee Weapon Attack.",
            attack: {
              type: "MELEE_WEAPON",
              attackBonus: 4,
              reachFeet: 5,
              rangeNormalFeet: null,
              rangeLongFeet: null,
              damage: [{ diceCount: 2, diceFaces: 4, bonus: 2, damageType: "PIERCING" }],
            },
            recharge: null,
            usesPerDay: null,
            legendaryCost: null,
            displayOrder: 0,
          },
        ],
      }),
      [],
    );

    expect(block.attacks).toEqual([
      expect.objectContaining({ source: "TRAIT", key: "bite", attackBonus: 4, attackType: "MELEE_WEAPON" }),
    ]);
  });
});
