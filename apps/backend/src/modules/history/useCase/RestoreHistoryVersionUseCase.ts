import type { RequestContext } from "#core/http/requestContext";
import type { GetEntityVersionParams } from "#core/history/types";
import { HistoryService } from "#src/modules/history/service/HistoryService";

export class RestoreHistoryVersionUseCase {
  constructor(private readonly historyService: HistoryService) {}

  async execute(
    context: RequestContext,
    params: GetEntityVersionParams,
    input: { reason?: string | undefined },
  ): Promise<{ actionId: string }> {
    return this.historyService.restoreVersion(context, {
      ...params,
      reason: input.reason ?? null,
    });
  }
}
