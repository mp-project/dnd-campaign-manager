import type { RequestContext } from "#core/http/requestContext";
import type { ResponseValidationDto } from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

/**
 * Checks a stored spell list against the current state: schemas, the code per ruleset and the
 * spells it holds. Changes nothing, so a list that became invalid through changes elsewhere can be
 * found first.
 */
export class ValidateSpellListUseCase {
  constructor(private readonly spellsService: SpellsService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; spellListId: string },
  ): Promise<ResponseValidationDto> {
    const { db } = this.spellsService;

    await this.spellsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.spellsService.requireScopedSpellList(db, input);
    const issues = await this.spellsService.validateStored(db, found.asset);

    return { id: input.spellListId, valid: issues.length === 0, issues };
  }
}
