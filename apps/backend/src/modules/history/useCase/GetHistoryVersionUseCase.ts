import type { RequestContext } from "#core/http/requestContext";
import type { EntityVersionView, GetEntityVersionParams } from "#core/history/types";
import { HistoryService } from "#src/modules/history/service/HistoryService";

export class GetHistoryVersionUseCase {
  constructor(private readonly historyService: HistoryService) {}

  async execute(
    context: RequestContext,
    params: GetEntityVersionParams,
  ): Promise<EntityVersionView> {
    return this.historyService.getVersion(context, params);
  }
}
