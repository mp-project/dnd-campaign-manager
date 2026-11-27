import type { AppDatabase } from "#core/db/pool";
import { MutationUseCase } from "#core/history/MutationUseCase";
import { authorized, type Authorization } from "#core/history/authorization";
import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
import type { ItemInstancePresenter } from "#src/modules/items/useCase/ItemInstancePresenter";

export type ItemInstancePath = { campaignId: string; instanceId: string };

/** A command on one instance: its path and the body. */
export type ItemInstanceCommand<T> = ItemInstancePath & { command: T };

/** Every change of an instance: the GM, editors and administrators of the campaign. */
export abstract class ItemInstanceMutation<Input extends { campaignId: string }, Output> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly instances: ItemInstancesService,
    protected readonly presenter: ItemInstancePresenter,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.instances.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}
