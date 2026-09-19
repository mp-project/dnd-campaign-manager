export type RulesetSeedRow = {
  code: string;
  name: string;
  description: string;
  editionYear: number;
  sourceReference: Record<string, unknown>;
  licenseCode: string;
  attribution: string;
};

const experienceThresholds2014 = [
  0,
  300,
  900,
  2_700,
  6_500,
  14_000,
  23_000,
  34_000,
  48_000,
  64_000,
  85_000,
  100_000,
  120_000,
  140_000,
  165_000,
  195_000,
  225_000,
  265_000,
  305_000,
  355_000,
] as const;

const fullCasterSpellSlotMatrix = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
] as const;

export const seedActorId = "00000000-0000-4000-8000-000000000001";

export const rulesetSeedRows: readonly RulesetSeedRow[] = [
  {
    code: "DND_5E_2014",
    name: "D&D 5E (2014)",
    description: "Fifth Edition (2014 core rules)",
    editionYear: 2014,
    sourceReference: {
      publisher: "Wizards of the Coast",
      book: "Player's Handbook",
      year: 2014,
    },
    licenseCode: "WOTC_PHB_2014",
    attribution: "Wizards of the Coast",
  },
  {
    code: "DND_5E_2024",
    name: "D&D 5E (2024)",
    description: "Fifth Edition revised rules (2024)",
    editionYear: 2024,
    sourceReference: {
      publisher: "Wizards of the Coast",
      book: "Player's Handbook (Revised)",
      year: 2024,
    },
    licenseCode: "WOTC_PHB_2024",
    attribution: "Wizards of the Coast",
  },
];

function toProficiencyBonus(characterLevel: number): number {
  return Math.floor((characterLevel - 1) / 4) + 2;
}

export function buildLevelProgressions() {
  return Array.from({ length: 20 }, (_, index) => {
    const characterLevel = index + 1;

    return {
      characterLevel,
      proficiencyBonus: toProficiencyBonus(characterLevel),
      experienceThreshold: experienceThresholds2014[index] ?? null,
    };
  });
}

export function buildSpellSlotProgressions() {
  return fullCasterSpellSlotMatrix.flatMap((slots, casterLevelIndex) => {
    const casterLevel = casterLevelIndex + 1;

    return slots.map((slotCount, slotLevelIndex) => ({
      casterLevel,
      slotLevel: slotLevelIndex + 1,
      slotCount,
    }));
  });
}
