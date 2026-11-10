import { UUID_PATTERN } from "#core/uuid";
import type {
  Ability,
  BackgroundDefinition,
  Currency,
  EquipmentEntry,
  ProficiencyGrantType,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import type { ResolveBackgroundDto } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { CustomizationMode, DefinitionIssue } from "#src/modules/backgrounds/domain/BackgroundDefinition";

/** `STANDARD`: as written; `RULESET_CUSTOMIZED`: with the 2014 customization. */
export type BackgroundSelectionMode = "STANDARD" | "RULESET_CUSTOMIZED";

export type SelectedProficiency = {
  type: ProficiencyGrantType;
  code: string | null;
  assetId: string | null;
  /** Key as character snapshots list proficiencies, e.g. `skill.insight` or `tool.<item id>`. */
  proficiencyKey: string;
  /** The grant it comes from, or null for the customization. */
  grantKey: string | null;
};

export type SelectedFeat = { grantKey: string; featAssetId: string; chosen: boolean };

/** An entry of the chosen equipment option; `itemAssetId` is the fixed or the chosen item. */
export type SelectedEquipmentItem = {
  entryKey: string;
  itemAssetId: string;
  quantity: number;
  /** The entry's filter when the item was chosen, for the check of the item. */
  choiceFilter: EquipmentEntry["choiceFilter"];
};

export type SelectedPrompt = {
  tableKey: string;
  promptType: string;
  text: string;
  roll: number | null;
  custom: boolean;
};

export type BackgroundSelection = {
  selectionMode: BackgroundSelectionMode;
  abilityIncreases: Partial<Record<Ability, number>>;
  proficiencies: SelectedProficiency[];
  feats: SelectedFeat[];
  equipment: {
    optionCode: string;
    items: SelectedEquipmentItem[];
    currency: Partial<Record<Currency, number>>;
  } | null;
  prompts: SelectedPrompt[];
  conflicts: BackgroundConflict[];
  issues: DefinitionIssue[];
};

export type BackgroundConflict = {
  code: "DUPLICATE_PROFICIENCY" | "DUPLICATE_FEAT";
  proficiencyKey: string | null;
  featAssetId: string | null;
  message: string;
};

/** How often a feat may be taken, as stored in its `repeatability`. */
export type FeatRepeatability = { mode: string; maximumOccurrences?: number | null };

/**
 * Whether a character that has the feat `timesTaken` times may take it once more: `ONCE` feats
 * only the first time, `LIMITED` ones up to their maximum, the others (distinct by choice,
 * unlimited) again; the feats module checks the choices that tell occurrences apart.
 */
export function canTakeFeatAgain(repeatability: FeatRepeatability | null, timesTaken: number): boolean {
  switch (repeatability?.mode) {
    case "UNLIMITED":
    case "DISTINCT_BY_CHOICE":
      return true;
    case "LIMITED":
      return timesTaken < (repeatability.maximumOccurrences ?? 1);
    default:
      return timesTaken === 0;
  }
}

const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function proficiencyKeyOf(type: ProficiencyGrantType, value: { code: string | null; assetId: string | null }) {
  return `${type.toLowerCase()}.${value.code ?? value.assetId}`;
}

/** An answer as code or tool item; null when it is neither. */
function parseProficiencyValue(
  type: ProficiencyGrantType,
  value: string,
): { code: string | null; assetId: string | null } | null {
  if (UUID_PATTERN.test(value)) {
    return type === "TOOL" ? { code: null, assetId: value } : null;
  }

  return CODE_PATTERN.test(value) ? { code: value, assetId: null } : null;
}

function checkAbilities(
  definition: BackgroundDefinition,
  allocations: ResolveBackgroundDto["abilityAllocations"],
  issues: DefinitionIssue[],
): Partial<Record<Ability, number>> {
  const rule = definition.abilityRule;
  const given = Object.entries(allocations) as [Ability, number][];
  const path = ["abilityAllocations"];

  if (rule.mode !== "CHOOSE_2024") {
    if (given.length > 0) {
      issues.push({ path, message: "This background distributes no ability increases" });
    }

    return rule.mode === "FIXED"
      ? Object.fromEntries(rule.increases.map((increase) => [increase.ability, increase.amount]))
      : {};
  }

  const total = given.reduce((sum, [, amount]) => sum + amount, 0);

  for (const [ability, amount] of given) {
    if (!rule.allowedAbilities.includes(ability)) {
      issues.push({ path: [...path, ability], message: `${ability} is not one of the background's abilities` });
    }

    if (amount > rule.maximumPerAbility) {
      issues.push({ path: [...path, ability], message: `At most +${rule.maximumPerAbility} on one ability` });
    }
  }

  if (total !== rule.totalIncrease) {
    issues.push({ path, message: `Distribute exactly +${rule.totalIncrease} (+2/+1 or +1/+1/+1)` });
  }

  return Object.fromEntries(given);
}

function checkProficiencies(
  definition: BackgroundDefinition,
  command: ResolveBackgroundDto,
  issues: DefinitionIssue[],
): SelectedProficiency[] {
  const result: SelectedProficiency[] = [];
  const grantKeys = new Set(definition.proficiencyGrants.map((grant) => grant.key));

  for (const key of Object.keys(command.proficiencyChoices)) {
    if (!grantKeys.has(key)) {
      issues.push({ path: ["proficiencyChoices", key], message: `Unknown proficiency choice '${key}'` });
    }
  }

  for (const grant of definition.proficiencyGrants) {
    const path = ["proficiencyChoices", grant.key];

    if (grant.selectionMode === "FIXED") {
      if (command.proficiencyChoices[grant.key] !== undefined) {
        issues.push({ path, message: "Fixed proficiencies are not chosen" });
      }

      result.push(
        ...grant.options.map((option) => ({
          type: grant.type,
          ...option,
          proficiencyKey: proficiencyKeyOf(grant.type, option),
          grantKey: grant.key,
        })),
      );
      continue;
    }

    const answers = command.proficiencyChoices[grant.key] ?? [];

    if (answers.length !== grant.choiceCount) {
      issues.push({ path, message: `Choose exactly ${grant.choiceCount}` });
    }

    if (new Set(answers).size !== answers.length) {
      issues.push({ path, message: "Choices must be unique" });
    }

    for (const answer of answers) {
      const value = parseProficiencyValue(grant.type, answer);
      const offered =
        grant.options.length === 0 ||
        grant.options.some((option) => option.code === answer || option.assetId === answer);

      if (value === null || !offered) {
        issues.push({ path, message: `'${answer}' is no option of the choice` });
        continue;
      }

      result.push({ type: grant.type, ...value, proficiencyKey: proficiencyKeyOf(grant.type, value), grantKey: grant.key });
    }
  }

  return result;
}

/** The 2014 customization: two skills and two tools or languages instead of the background's. */
function checkCustomization(
  customization: NonNullable<ResolveBackgroundDto["customization"]>,
  command: ResolveBackgroundDto,
  issues: DefinitionIssue[],
): SelectedProficiency[] {
  const path = ["customization"];
  const result: SelectedProficiency[] = [];

  if (Object.keys(command.proficiencyChoices).length > 0) {
    issues.push({ path: ["proficiencyChoices"], message: "A customized background chooses its proficiencies in the customization" });
  }

  if (customization.skills.length !== 2) {
    issues.push({ path: [...path, "skills"], message: "Choose exactly two skills" });
  }

  if (customization.toolsAndLanguages.length !== 2) {
    issues.push({ path: [...path, "toolsAndLanguages"], message: "Choose a total of two tools or languages" });
  }

  const entries = [
    ...customization.skills.map((value) => ({ type: "SKILL" as const, value, at: "skills" })),
    ...customization.toolsAndLanguages.map((entry) => ({ ...entry, at: "toolsAndLanguages" })),
  ];

  for (const entry of entries) {
    const value = parseProficiencyValue(entry.type, entry.value);

    if (value === null) {
      issues.push({ path: [...path, entry.at], message: `'${entry.value}' is no ${entry.type.toLowerCase()}` });
      continue;
    }

    result.push({ type: entry.type, ...value, proficiencyKey: proficiencyKeyOf(entry.type, value), grantKey: null });
  }

  if (new Set(result.map((item) => item.proficiencyKey)).size !== result.length) {
    issues.push({ path, message: "Customized proficiencies must be unique" });
  }

  return result;
}

function checkFeats(
  definition: BackgroundDefinition,
  command: ResolveBackgroundDto,
  issues: DefinitionIssue[],
): SelectedFeat[] {
  const choosing = new Set(
    definition.featGrants.filter((grant) => grant.selectionMode === "CHOOSE").map((grant) => grant.key),
  );

  for (const key of Object.keys(command.featChoices)) {
    if (!choosing.has(key)) {
      issues.push({ path: ["featChoices", key], message: `Unknown feat choice '${key}'` });
    }
  }

  return definition.featGrants.flatMap((grant): SelectedFeat[] => {
    if (grant.featAssetId !== null) {
      return [{ grantKey: grant.key, featAssetId: grant.featAssetId, chosen: false }];
    }

    const chosen = command.featChoices[grant.key];

    if (chosen === undefined) {
      issues.push({ path: ["featChoices", grant.key], message: "Choose a feat" });
      return [];
    }

    return [{ grantKey: grant.key, featAssetId: chosen, chosen: true }];
  });
}

function checkEquipment(
  definition: BackgroundDefinition,
  choice: ResolveBackgroundDto["equipmentChoice"],
  issues: DefinitionIssue[],
): BackgroundSelection["equipment"] {
  const path = ["equipmentChoice"];

  if (definition.equipmentOptions.length === 0) {
    if (choice !== null) {
      issues.push({ path, message: "This background has no equipment to choose" });
    }

    return null;
  }

  if (choice === null) {
    issues.push({ path, message: "Choose one of the equipment options" });
    return null;
  }

  const option = definition.equipmentOptions.find((item) => item.code === choice.optionCode);

  if (!option) {
    issues.push({ path: [...path, "optionCode"], message: `Unknown equipment option '${choice.optionCode}'` });
    return null;
  }

  const choosing = new Set(option.entries.filter((entry) => entry.choiceFilter !== null).map((entry) => entry.key));

  for (const key of Object.keys(choice.itemChoices)) {
    if (!choosing.has(key)) {
      issues.push({ path: [...path, "itemChoices", key], message: `Entry '${key}' has nothing to choose` });
    }
  }

  const items = option.entries.flatMap((entry): SelectedEquipmentItem[] => {
    if (entry.itemAssetId !== null) {
      return [{ entryKey: entry.key, itemAssetId: entry.itemAssetId, quantity: entry.quantity, choiceFilter: null }];
    }

    const chosen = choice.itemChoices[entry.key];

    if (chosen === undefined) {
      issues.push({ path: [...path, "itemChoices", entry.key], message: "Choose an item" });
      return [];
    }

    return [{ entryKey: entry.key, itemAssetId: chosen, quantity: entry.quantity, choiceFilter: entry.choiceFilter }];
  });

  return { optionCode: option.code, items, currency: { ...(option.currency ?? {}) } };
}

function checkPrompts(
  definition: BackgroundDefinition,
  selections: ResolveBackgroundDto["promptSelections"],
  issues: DefinitionIssue[],
): SelectedPrompt[] {
  return selections.flatMap((selection, index): SelectedPrompt[] => {
    const path = ["promptSelections", index];
    const table = definition.promptTables.find((item) => item.key === selection.tableKey);

    if (!table) {
      issues.push({ path: [...path, "tableKey"], message: `Unknown prompt table '${selection.tableKey}'` });
      return [];
    }

    const header = { tableKey: table.key, promptType: table.promptType };

    if (selection.customText !== undefined) {
      return [{ ...header, text: selection.customText, roll: null, custom: true }];
    }

    if (selection.roll !== undefined) {
      const roll = selection.roll;
      const option =
        table.rollDie !== null && roll <= table.rollDie
          ? table.options.find((item) => (item.rollMin ?? 0) <= roll && roll <= (item.rollMax ?? 0))
          : undefined;

      if (!option) {
        issues.push({ path: [...path, "roll"], message: `${roll} is no result of the table` });
        return [];
      }

      return [{ ...header, text: option.text, roll, custom: false }];
    }

    const option = table.options[selection.optionIndex ?? -1];

    if (!option) {
      issues.push({ path: [...path, "optionIndex"], message: "Unknown option of the table" });
      return [];
    }

    return [{ ...header, text: option.text, roll: null, custom: false }];
  });
}

/**
 * Checks a character's choices against a background definition (as the viewer may see it) without
 * the database: ability distribution, proficiency choices or the 2014 customization, which feats
 * are taken, the equipment option and its item choices, and prompt selections. Answers that need
 * the database (which feats and items may be chosen, the feature of another background) are left
 * to the service; duplicates with what the character already has are conflicts, not issues.
 */
export function validateBackgroundSelection(
  input: { customizationMode: CustomizationMode; definition: BackgroundDefinition },
  command: ResolveBackgroundDto,
): BackgroundSelection {
  const issues: DefinitionIssue[] = [];
  const { definition } = input;
  const customization = command.customization;

  if (customization !== null && input.customizationMode !== "RULESET_CUSTOMIZABLE") {
    issues.push({ path: ["customization"], message: "This background cannot be customized" });
  }

  const proficiencies =
    customization === null
      ? checkProficiencies(definition, command, issues)
      : checkCustomization(customization, command, issues);
  const owned = new Set(command.actor.proficiencies ?? []);

  return {
    selectionMode: customization === null ? "STANDARD" : "RULESET_CUSTOMIZED",
    abilityIncreases: checkAbilities(definition, command.abilityAllocations, issues),
    proficiencies,
    feats: checkFeats(definition, command, issues),
    equipment: checkEquipment(definition, command.equipmentChoice, issues),
    prompts: checkPrompts(definition, command.promptSelections, issues),
    conflicts: proficiencies
      .filter((proficiency) => owned.has(proficiency.proficiencyKey))
      .map((proficiency) => ({
        code: "DUPLICATE_PROFICIENCY" as const,
        proficiencyKey: proficiency.proficiencyKey,
        featAssetId: null,
        message: "The character already has this proficiency; the rules allow another of the same kind instead",
      })),
    issues,
  };
}
