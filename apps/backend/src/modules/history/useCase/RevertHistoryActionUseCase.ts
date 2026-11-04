import type { RequestContext } from "#core/http/requestContext";
import { HistoryService } from "#src/modules/history/service/HistoryService";

export class RevertHistoryActionUseCase {
  constructor(private readonly historyService: HistoryService) {}

  async execute(
    context: RequestContext,
    actionId: string,
    input: { reason?: string | undefined },
  ): Promise<{ actionId: string }> {
    return this.historyService.revertAction(context, actionId, {
      reason: input.reason ?? null,
    });
  }
}
