import type { AppDatabase } from "#core/db/pool";
import { MutationUseCase } from "#core/history/MutationUseCase";
import { authorized, type Authorization } from "#core/history/authorization";
import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

/** `campaignId` null works on global items, which only administrators may change. */
export type ItemScoped = { campaignId: string | null };

/** Every write checks the same rule: global items administrators, custom items GMs and editors. */
export abstract class ItemMutation<Input extends ItemScoped, Output> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly itemsService: ItemsService,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.itemsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}
