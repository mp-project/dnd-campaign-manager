import type { RequestContext } from "#core/http/requestContext";
import type { ResponseValidationDto } from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

/**
 * Checks a stored spell against the current state: schemas, rules across fields, the code per
 * ruleset and the referenced lists and options. Changes nothing, so a spell that became invalid
 * through changes elsewhere can be found first.
 */
export class ValidateSpellUseCase {
  constructor(private readonly spellsService: SpellsService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; spellId: string },
  ): Promise<ResponseValidationDto> {
    const { db } = this.spellsService;

    await this.spellsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.spellsService.requireScopedSpell(db, input);
    const issues = await this.spellsService.validateStored(db, found.asset);

    return { id: input.spellId, valid: issues.length === 0, issues };
  }
}
