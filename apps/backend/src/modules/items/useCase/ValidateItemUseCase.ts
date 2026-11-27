import type { RequestContext } from "#core/http/requestContext";
import type { ResponseValidationDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

/**
 * Checks a stored item against the current state: schemas, rules across fields, the code per
 * ruleset and the referenced features and spells. Changes nothing.
 */
export class ValidateItemUseCase {
  constructor(private readonly itemsService: ItemsService) {}

  async execute(context: RequestContext, input: { campaignId: string | null; itemId: string }): Promise<ResponseValidationDto> {
    const { db } = this.itemsService;

    await this.itemsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.itemsService.requireScopedItem(db, input);
    const issues = await this.itemsService.validateStored(db, found);

    return { id: input.itemId, valid: issues.length === 0, issues };
  }
}
