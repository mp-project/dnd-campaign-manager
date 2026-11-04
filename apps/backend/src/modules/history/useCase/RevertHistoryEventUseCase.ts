import type { RequestContext } from "#core/http/requestContext";
import { HistoryService } from "#src/modules/history/service/HistoryService";

export class RevertHistoryEventUseCase {
  constructor(private readonly historyService: HistoryService) {}

  async execute(
    context: RequestContext,
    eventId: string,
    input: { fields?: readonly string[] | undefined; reason?: string | undefined },
  ): Promise<{ actionId: string }> {
    return this.historyService.revertEvent(context, eventId, {
      ...(input.fields ? { fields: input.fields } : {}),
      reason: input.reason ?? null,
    });
  }
}
