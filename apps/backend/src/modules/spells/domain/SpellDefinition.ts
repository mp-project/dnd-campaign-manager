import { assertExpressionLimits, collectVariableKeys } from "#core/rules/evaluator";
import {
  listPayloadDiceRefs,
  listPayloadExpressions,
  type PredicateExpression,
  type ValueExpression,
} from "#core/rules/contracts";
import { ASSET_TYPES, type AssetReference } from "#src/modules/assets/index";
import type {
  SpellChoice,
  SpellDefinition,
  SpellEffect,
  SpellScalingTrack,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import { SPELL_MAX_LEVEL } from "#src/modules/spells/domain/entities/SpellsTable";

export type DefinitionIssue = { path: (string | number)[]; message: string };

/** The fields of a spell the rules look at besides its definition parts. */
export type SpellCore = {
  level: number;
  description: string | null;
  isRitual: boolean;
  castingTimeType: string;
  castingTimeAmount: number;
  castingTrigger: string | null;
  rangeType: string;
  rangeDistance: number | null;
  rangeUnit: string | null;
  durationType: string;
  durationAmount: number | null;
  durationUnit: string | null;
  requiresConcentration: boolean;
  componentMaterial: boolean;
};

export type SpellState = SpellCore & SpellDefinition;

/** Values a resolution may provide; missing ones make results unknown, not invalid. */
export const SPELL_CONTEXT_VALUE_KEYS: readonly string[] = [
  "level.character",
  "level.spell",
  "caster.modifier",
  "caster.attackBonus",
  "caster.saveDc",
  "proficiencyBonus",
];

/** Only spells cast with a slot know these; cantrips don't use slots. */
export const SLOT_VALUE_KEYS: readonly string[] = ["slot.level", "slot.above"];

const NUMERIC_SCALING_TYPES = new Set(["INTEGER", "DECIMAL", "DISTANCE"]);

export const scalingVariable = (key: string) => `scale.${key}`;

/** Variables and dice the expressions of this spell may use. */
export function buildSpellVocabulary(
  spell: Pick<SpellState, "level" | "scalingTracks">,
): { valueKeys: Set<string>; diceKeys: Set<string> } {
  const valueKeys = new Set(SPELL_CONTEXT_VALUE_KEYS);
  const diceKeys = new Set<string>();

  if (spell.level > 0) {
    SLOT_VALUE_KEYS.forEach((key) => valueKeys.add(key));
  }

  for (const track of spell.scalingTracks) {
    if (NUMERIC_SCALING_TYPES.has(track.valueType)) {
      valueKeys.add(scalingVariable(track.key));
    } else if (track.valueType === "DIE") {
      diceKeys.add(scalingVariable(track.key));
    }
  }

  return { valueKeys, diceKeys };
}

function duplicates(keys: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      repeated.add(key);
    }

    seen.add(key);
  }

  return repeated;
}

/** Effects on a cycle of `dependsOnEffectKeys`. */
function cyclicEffects(effects: readonly SpellEffect[]): Set<string> {
  const edges = new Map(effects.map((effect) => [effect.key, effect.dependsOnEffectKeys]));
  const cyclic = new Set<string>();

  for (const start of edges.keys()) {
    const seen = new Set<string>();
    let frontier = [...(edges.get(start) ?? [])];

    while (frontier.length > 0 && !cyclic.has(start)) {
      const next: string[] = [];

      for (const node of frontier) {
        if (node === start) {
          cyclic.add(start);
        } else if (!seen.has(node)) {
          seen.add(node);
          next.push(...(edges.get(node) ?? []));
        }
      }

      frontier = next;
    }
  }

  return cyclic;
}

function checkExpression(
  expression: { kind: "value"; root: ValueExpression } | { kind: "predicate"; root: PredicateExpression },
  allowed: ReadonlySet<string>,
  level: number,
  path: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  try {
    assertExpressionLimits(expression);
  } catch (error) {
    add(path, error instanceof Error ? error.message : "The expression is too large");
    return;
  }

  for (const key of collectVariableKeys(expression)) {
    if (allowed.has(key)) {
      continue;
    }

    add(
      path,
      level === 0 && SLOT_VALUE_KEYS.includes(key)
        ? `Cantrips use no spell slot, so '${key}' is not available`
        : `Unknown variable '${key}'`,
    );
  }
}

function checkScalingTrack(
  track: SpellScalingTrack,
  level: number,
  path: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  if (track.scaleBy !== "SLOT_LEVEL") {
    return;
  }

  if (level === 0) {
    add([...path, "scaleBy"], "Cantrips use no spell slot; scale them by character level");
    return;
  }

  track.values.forEach((step, index) => {
    if (step.minimumLevel < level) {
      add([...path, "values", index, "minimumLevel"], `Slot levels start at the spell level (${level})`);
    }

    if (step.minimumLevel > SPELL_MAX_LEVEL) {
      add([...path, "values", index, "minimumLevel"], `Slot levels end at ${SPELL_MAX_LEVEL}`);
    }
  });
}

/**
 * Rules across the fields and parts of a spell that need no database: something that says what the
 * spell does, cantrips without slots and rituals, the trigger of reactions, the fields that belong
 * to a range or a duration, material components with their entries, unique keys, effects that name
 * known targets and form no cycle, expressions within their limits and with known variables, and
 * slot scaling not below the spell level. Asset references are checked by the service.
 */
export function validateSpellDefinition(spell: SpellState): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  if (spell.description === null && spell.sections.length === 0 && spell.effects.length === 0) {
    add(["description"], "A spell needs a description, a section or an effect");
  }

  if (spell.level === 0 && spell.isRitual) {
    add(["isRitual"], "Cantrips can't be cast as rituals");
  }

  if ((spell.castingTimeType === "REACTION") !== (spell.castingTrigger !== null)) {
    add(["castingTrigger"], "Reactions, and only they, need a trigger");
  }

  if (spell.castingTimeType !== "MINUTE" && spell.castingTimeType !== "HOUR" && spell.castingTimeAmount !== 1) {
    add(["castingTimeAmount"], "Actions, bonus actions and reactions take exactly one");
  }

  if ((spell.rangeType === "DISTANCE") !== (spell.rangeDistance !== null)) {
    add(["rangeDistance"], "A distance, and only a distance, needs a value");
  }

  if ((spell.rangeDistance === null) !== (spell.rangeUnit === null)) {
    add(["rangeUnit"], "A distance needs a unit");
  }

  if ((spell.durationType === "TIMED") !== (spell.durationAmount !== null)) {
    add(["durationAmount"], "A timed duration, and only it, needs an amount");
  }

  if ((spell.durationAmount === null) !== (spell.durationUnit === null)) {
    add(["durationUnit"], "A timed duration needs a unit");
  }

  if (spell.requiresConcentration && spell.durationType === "INSTANTANEOUS") {
    add(["requiresConcentration"], "Instantaneous spells can't require concentration");
  }

  if (spell.componentMaterial !== spell.materials.length > 0) {
    add(["materials"], "Material components, and only they, list their materials");
  }

  const requirementTypes = spell.requirements
    .map((requirement) => requirement.type)
    .filter((type) => type !== "SPECIAL");

  for (const type of duplicates(requirementTypes)) {
    add(["requirements"], `Requirement '${type}' is listed more than once`);
  }

  const partKeys: [keyof SpellDefinition, readonly { key: string }[]][] = [
    ["sections", spell.sections],
    ["targets", spell.targets],
    ["choices", spell.choices],
    ["scalingTracks", spell.scalingTracks],
    ["effects", spell.effects],
  ];

  for (const [name, items] of partKeys) {
    for (const key of duplicates(items.map((item) => item.key))) {
      add([name], `Key '${key}' is used more than once`);
    }
  }

  spell.scalingTracks.forEach((track, index) =>
    checkScalingTrack(track, spell.level, ["scalingTracks", index], add),
  );

  const { valueKeys, diceKeys } = buildSpellVocabulary(spell);
  const targetKeys = new Set(spell.targets.map((target) => target.key));
  const effectKeys = new Set(spell.effects.map((effect) => effect.key));
  const cyclic = cyclicEffects(spell.effects);

  spell.effects.forEach((effect, index) => {
    const path = ["effects", index];

    if (effect.targetKey !== null && !targetKeys.has(effect.targetKey)) {
      add([...path, "targetKey"], `Unknown target '${effect.targetKey}'`);
    }

    for (const key of effect.dependsOnEffectKeys) {
      if (key === effect.key) {
        add([...path, "dependsOnEffectKeys"], "An effect cannot depend on itself");
      } else if (!effectKeys.has(key)) {
        add([...path, "dependsOnEffectKeys"], `Unknown effect '${key}'`);
      }
    }

    if (cyclic.has(effect.key)) {
      add([...path, "dependsOnEffectKeys"], "Effect dependencies form a cycle");
    }

    if (effect.condition) {
      checkExpression({ kind: "predicate", root: effect.condition }, valueKeys, spell.level, [...path, "condition"], add);
    }

    for (const expression of listPayloadExpressions(effect.payload)) {
      checkExpression({ kind: "value", root: expression }, valueKeys, spell.level, [...path, "payload"], add);
    }

    for (const ref of listPayloadDiceRefs(effect.payload)) {
      if (!diceKeys.has(ref)) {
        add([...path, "payload", "dice"], `Unknown dice '${ref}'`);
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** Spell lists the spell names. */
export function collectListReferences(spellListIds: readonly string[]): AssetReference[] {
  return spellListIds.map((assetId, index) => ({
    assetId,
    path: ["spellListIds", index],
    assetTypes: ["SPELL_LIST"],
  }));
}

/** Assets that fixed choice options link to. */
export function collectChoiceReferences(choices: readonly SpellChoice[]): AssetReference[] {
  return choices.flatMap((choice, choiceIndex) =>
    choice.options.flatMap((option, optionIndex) =>
      option.linkedAssetId === null
        ? []
        : [
            {
              assetId: option.linkedAssetId,
              path: ["choices", choiceIndex, "options", optionIndex, "linkedAssetId"],
              assetTypes: ASSET_TYPES,
            },
          ],
    ),
  );
}

/** The spells of a list. */
export function collectEntryReferences(spellIds: readonly string[]): AssetReference[] {
  return spellIds.map((assetId, index) => ({
    assetId,
    path: ["spellIds", index],
    assetTypes: ["SPELL"],
  }));
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

/** Choices without options that link to hidden assets. */
export function toPlayerChoices(
  choices: readonly SpellChoice[],
  isVisible: (assetId: string) => boolean,
): SpellChoice[] {
  return choices.map((choice) => ({
    ...choice,
    options: choice.options.filter(
      (option) => option.linkedAssetId === null || isVisible(option.linkedAssetId),
    ),
  }));
}
