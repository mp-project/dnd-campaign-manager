import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

/** `campaignId` null works on global content, which only administrators may change. */
export type SpellScoped = { campaignId: string | null };

/** Every write checks the same rule: global content administrators, custom content GMs and editors. */
export abstract class SpellMutation<Input extends SpellScoped, Output> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly spellsService: SpellsService,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.spellsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}
