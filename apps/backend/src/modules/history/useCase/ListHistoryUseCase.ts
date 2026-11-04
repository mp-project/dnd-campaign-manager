import type { RequestContext } from "#core/http/requestContext";
import type { FieldChangePage, ListFieldChangesParams } from "#core/history/types";
import { HistoryService } from "#src/modules/history/service/HistoryService";

export class ListHistoryUseCase {
  constructor(private readonly historyService: HistoryService) {}

  async execute(context: RequestContext, params: ListFieldChangesParams): Promise<FieldChangePage> {
    return this.historyService.listFieldChanges(context, params);
  }
}
