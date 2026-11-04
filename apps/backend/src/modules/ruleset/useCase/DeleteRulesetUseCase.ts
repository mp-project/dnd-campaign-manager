import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { RULESET_ACTIONS, trackedRuleset } from "#src/modules/ruleset/history/TrackedRuleset";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export type DeleteRulesetInput = {
  rulesetId: string;
};

export class DeleteRulesetUseCase extends MutationUseCase<DeleteRulesetInput, void> {
  protected readonly action = RULESET_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly rulesetService: RulesetService,
  ) {
    super(history);
  }

  /** Rulesets are global, so the permission on the route is the whole check. */
  protected async authorize(context: RequestContext): Promise<Authorization> {
    this.rulesetService.assertAuthenticated(context);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteRulesetInput,
  ): Promise<void> {
    await this.rulesetService.loadAggregate(scope.tx, input.rulesetId);
    await scope.softDelete(trackedRuleset, input.rulesetId);
  }
}
