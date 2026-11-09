import { CreateItemSchema } from "#src/modules/items/domain/dto/CreateItemDto";
import {
  CreateItemInstanceSchema,
  TransferItemInstanceSchema,
  UpdateItemSchema,
} from "#src/modules/items/domain/dto/UpdateItemDto";
import { abilityModifier, resolveItem, type ResolvableItem } from "#src/modules/items/domain/ItemResolution";
import { effectiveKnowledge } from "#src/modules/items/service/ItemInstancesService";

const ASSET_ID = "d0000000-0000-4000-8000-000000000001";
const FEATURE_ID = "d0000000-0000-4000-8000-000000000002";

const issuesOf = (input: unknown) => {
  const parsed = CreateItemSchema.safeParse(input);

  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

const DAGGER = {
  name: "Dagger",
  category: "WEAPON",
  weaponCategory: "SIMPLE",
  weaponCombatType: "MELEE",
  damageDiceCount: 1,
  damageDiceFaces: 4,
  damageType: "PIERCING",
  weaponProperties: ["FINESSE", "LIGHT", "THROWN"],
  rangeNormal: 20,
  rangeLong: 60,
};

/** A full item for the calculation, as stored. */
function item(overrides: Partial<ResolvableItem> = {}): ResolvableItem {
  return {
    code: "dagger",
    assetId: ASSET_ID,
    category: "WEAPON",
    costAmount: null,
    costCurrency: null,
    isMagical: false,
    weaponCategory: "SIMPLE",
    weaponCombatType: "MELEE",
    damageDiceCount: 1,
    damageDiceFaces: 4,
    damageFixed: null,
    damageType: "PIERCING",
    versatileDiceFaces: null,
    rangeNormal: 20,
    rangeLong: 60,
    masteryProperty: null,
    armorCategory: null,
    baseArmorClass: null,
    dexterityMode: null,
    dexterityCap: null,
    strengthRequirement: null,
    stealthDisadvantage: false,
    toolCategory: null,
    toolAbility: null,
    toolUses: null,
    capacityValue: null,
    capacityUnit: null,
    capacityWeight: null,
    magicBonus: 0,
    magicItemType: null,
    rarity: null,
    attunementMode: "NONE",
    attunementPrerequisite: null,
    chargesMaximum: null,
    weaponProperties: ["FINESSE", "LIGHT", "THROWN"],
    effects: [],
    featureGrants: [],
    spells: [],
    ...overrides,
  };
}

const state = { carried: true, equipped: true, attuned: false, currentCharges: null };

describe("item create DTO per category", () => {
  it("accepts every category with its own fields", () => {
    expect(issuesOf(DAGGER)).toEqual([]);
    expect(
      issuesOf({ name: "Chain Mail", category: "ARMOR", armorCategory: "HEAVY", baseArmorClass: 16, dexterityMode: "NONE", strengthRequirement: 13, stealthDisadvantage: true }),
    ).toEqual([]);
    expect(issuesOf({ name: "Shield", category: "SHIELD" })).toEqual([]);
    expect(issuesOf({ name: "Thieves' Tools", category: "TOOL", toolCategory: "OTHER", toolAbility: "dex" })).toEqual([]);
    expect(
      issuesOf({ name: "Backpack", category: "CONTAINER", capacityValue: 1, capacityUnit: "CUBIC_FEET", capacityWeight: 30 }),
    ).toEqual([]);
    expect(
      issuesOf({ name: "Ring of Protection", category: "MAGIC_ITEM", magicItemType: "RING", rarity: "RARE", attunementMode: "REQUIRED" }),
    ).toEqual([]);
    expect(issuesOf({ name: "Rope", category: "ADVENTURING_GEAR", weight: 10 })).toEqual([]);
    expect(issuesOf({ name: "Odd thing", category: "CUSTOM" })).toEqual([]);
  });

  it("refuses fields of other categories and missing required ones", () => {
    expect(issuesOf({ ...DAGGER, baseArmorClass: 12 }).length).toBeGreaterThan(0);
    expect(issuesOf({ name: "Rope", category: "ADVENTURING_GEAR", damageType: "FIRE" }).length).toBeGreaterThan(0);
    expect(issuesOf({ name: "Armor", category: "ARMOR", armorCategory: "SHIELD", baseArmorClass: 2, dexterityMode: "NONE" }).length).toBeGreaterThan(0);
    expect(issuesOf({ name: "Ring", category: "MAGIC_ITEM", magicItemType: "RING", attunementMode: "NONE" }).length).toBeGreaterThan(0);
  });

  it("checks weapon properties, ranges and damage", () => {
    expect(issuesOf({ ...DAGGER, rangeNormal: null, rangeLong: null })).toContain(
      "Ranged and thrown weapons, and only they, have a range",
    );
    expect(issuesOf({ ...DAGGER, weaponProperties: ["LIGHT", "HEAVY"], rangeNormal: null, rangeLong: null })).toContain(
      "A weapon can't be light and heavy",
    );
    expect(issuesOf({ ...DAGGER, weaponProperties: ["REACH", "THROWN"], weaponCombatType: "RANGED" })).toContain(
      "Only melee weapons have reach",
    );
    expect(issuesOf({ ...DAGGER, damageFixed: 1 })).toContain("Damage is dice or a fixed value, not both");
    expect(
      issuesOf({ ...DAGGER, damageDiceCount: null, damageDiceFaces: null, damageType: null }),
    ).toContain("Weapons without damage need the property SPECIAL");
    expect(issuesOf({ ...DAGGER, rangeLong: 10 })).toContain("The long range can't be shorter than the normal range");
  });

  it("checks magic, attunement and charges of effects, grants and spells", () => {
    const ring = { name: "Ring", category: "MAGIC_ITEM", magicItemType: "RING", rarity: "RARE", attunementMode: "NONE" };

    expect(issuesOf({ ...DAGGER, magicBonus: 1 })).toContain("Only magic items have a magic bonus");
    expect(
      issuesOf({
        ...ring,
        effects: [{ key: "ac", activation: "ATTUNED", payload: { type: "MODIFIER", stat: "ac", amount: { type: "CONST", value: 1 } } }],
      }),
    ).toContain("Only items that allow attunement can work while attuned");
    expect(
      issuesOf({ ...ring, featureGrants: [{ key: "g", featureAssetId: FEATURE_ID, activation: "ATTUNED" }] }),
    ).toContain("Only items that allow attunement can work while attuned");
    expect(issuesOf({ ...ring, spells: [{ key: "s", spellAssetId: FEATURE_ID, chargeCost: 1 }] })).toContain(
      "Only items with charges can spend them",
    );
    expect(issuesOf({ ...ring, chargesMaximum: 2, spells: [{ key: "s", spellAssetId: FEATURE_ID, chargeCost: 3 }] })).toContain(
      "A use can't cost more charges than the item holds",
    );
    expect(issuesOf({ ...ring, recharge: { timing: "DAWN", regain: { type: "ALL" } } })).toContain(
      "Only items with charges recharge",
    );
    expect(
      issuesOf({
        ...ring,
        effects: [{ key: "x", payload: { type: "MODIFIER", stat: "ac", amount: { type: "VAR", key: "charges.current" } } }],
      }),
    ).toContain("'charges.current' needs an item with charges");
  });

  it("asks for at least one field and both versions on update", () => {
    expect(UpdateItemSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
    expect(UpdateItemSchema.safeParse({ weight: 2, expectedVersion: 1 }).success).toBe(false);
    expect(UpdateItemSchema.safeParse({ weight: 2, expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(true);
  });

  it("defaults instances to one unassigned piece and checks transfers", () => {
    expect(CreateItemInstanceSchema.parse({ itemDefinitionAssetId: ASSET_ID })).toMatchObject({
      quantity: 1,
      ownerType: "UNASSIGNED",
      ownerAssetId: null,
      state: { condition: "PRISTINE" },
    });
    expect(CreateItemInstanceSchema.safeParse({ itemDefinitionAssetId: ASSET_ID, quantity: 0 }).success).toBe(false);
    expect(TransferItemInstanceSchema.safeParse({ ownerType: "ACTOR", expectedVersion: 1, quantity: 0 }).success).toBe(false);
  });
});

describe("item calculation", () => {
  it("uses the better ability for finesse weapons and adds proficiency and magic", () => {
    const resolved = resolveItem(item({ isMagical: true, magicBonus: 2, rarity: "RARE", magicItemType: "WEAPON" }), {
      actor: { abilities: { str: 12, dex: 17 }, proficiencyBonus: 2, proficiencies: ["simple-weapons"] },
      state,
      attack: { twoHanded: false },
    });

    expect(resolved.weapon).toMatchObject({
      attackAbility: "dex",
      abilityModifier: 3,
      proficient: true,
      attackBonus: 7,
      damage: { dice: { count: 1, faces: 4 }, bonus: 5 },
    });
  });

  it("leaves the magic bonus out until a required attunement exists", () => {
    const sword = item({ isMagical: true, magicBonus: 1, rarity: "RARE", magicItemType: "WEAPON", attunementMode: "REQUIRED" });
    const input = { actor: { abilities: { str: 10, dex: 10 }, proficiencyBonus: 2, proficiencies: [] }, attack: { twoHanded: false } };

    expect(resolveItem(sword, { ...input, state }).weapon).toMatchObject({ magicBonus: 0, attackBonus: 0 });
    expect(resolveItem(sword, { ...input, state: { ...state, attuned: true } }).weapon).toMatchObject({
      magicBonus: 1,
      attackBonus: 1,
    });
  });

  it("caps Dexterity for medium armor and reports the Strength requirement", () => {
    const armor = item({
      category: "ARMOR",
      weaponCategory: null,
      weaponCombatType: null,
      damageDiceCount: null,
      damageDiceFaces: null,
      damageType: null,
      rangeNormal: null,
      rangeLong: null,
      weaponProperties: [],
      armorCategory: "MEDIUM",
      baseArmorClass: 14,
      dexterityMode: "CAPPED",
      dexterityCap: 2,
      strengthRequirement: 15,
    });
    const resolved = resolveItem(armor, {
      actor: { abilities: { str: 13, dex: 18 } },
      state,
      attack: { twoHanded: false },
    });

    expect(resolved.armor).toMatchObject({ armorClass: 16, dexterityBonus: 2, meetsStrengthRequirement: false });
    expect(resolved.weapon).toBeNull();
  });

  it("adds up active effects only", () => {
    const ring = item({
      category: "MAGIC_ITEM",
      weaponCategory: null,
      weaponCombatType: null,
      damageDiceCount: null,
      damageDiceFaces: null,
      damageType: null,
      rangeNormal: null,
      rangeLong: null,
      weaponProperties: [],
      isMagical: true,
      rarity: "RARE",
      magicItemType: "RING",
      attunementMode: "OPTIONAL",
      chargesMaximum: 3,
      effects: [
        { key: "ac", label: null, activation: "EQUIPPED", chargeCost: 0, condition: null, displayOrder: 0, payload: { type: "MODIFIER", stat: "ac", amount: { type: "CONST", value: 1 } } },
        { key: "str", label: null, activation: "ATTUNED", chargeCost: 0, condition: null, displayOrder: 1, payload: { type: "MODIFIER", stat: "ability.str", amount: { type: "CONST", value: 2 } } },
        { key: "fire", label: null, activation: "CARRIED", chargeCost: 0, condition: null, displayOrder: 2, payload: { type: "GRANT", grantType: "resistance", value: "fire" } },
        { key: "heal", label: null, activation: "ON_USE", chargeCost: 1, condition: null, displayOrder: 3, payload: { type: "HEAL", amount: { type: "VAR", key: "charges.current" } } },
      ],
    });
    const resolved = resolveItem(ring, {
      actor: {},
      state: { carried: true, equipped: true, attuned: false, currentCharges: 2 },
      attack: { twoHanded: false },
    });

    expect(resolved.totals).toEqual({
      modifiers: { ac: 1 },
      baseValues: {},
      grants: [{ grantType: "resistance", value: "fire" }],
      advantages: [],
    });
    expect(resolved.effects.find((effect) => effect.key === "heal")?.payload).toEqual({ type: "HEAL", dice: null, amount: 2 });
    expect(resolveItem(ring, { actor: {}, state: { ...state, carried: false }, attack: { twoHanded: false } }).totals.modifiers).toEqual({});
  });

  it("computes ability modifiers like the rules", () => {
    expect([1, 8, 9, 10, 11, 18, 20].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 4, 5]);
  });
});

describe("knowledge of instances", () => {
  const row = (userId: string | null, knowledgeLevel: "UNKNOWN" | "SEEN" | "IDENTIFIED") =>
    ({ userId, knowledgeLevel, knownName: null, knownDescription: null }) as never;

  it("prefers the player's own entry over the one for all players", () => {
    expect(effectiveKnowledge([row(null, "SEEN")], "p")?.knowledgeLevel).toBe("SEEN");
    expect(effectiveKnowledge([row(null, "SEEN"), row("p", "IDENTIFIED")], "p")?.knowledgeLevel).toBe("IDENTIFIED");
    expect(effectiveKnowledge([row(null, "IDENTIFIED"), row("p", "UNKNOWN")], "p")).toBeNull();
    expect(effectiveKnowledge([row("q", "IDENTIFIED")], "p")).toBeNull();
  });
});
