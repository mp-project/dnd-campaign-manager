import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { ResponseItemInstanceDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
import type { ItemInstancePath } from "#src/modules/items/useCase/ItemInstanceMutation";
import type { ItemInstancePresenter } from "#src/modules/items/useCase/ItemInstancePresenter";

export class GetItemInstanceUseCase {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly assetsService: AssetsService,
    private readonly presenter: ItemInstancePresenter,
  ) {}

  async execute(context: RequestContext, input: ItemInstancePath): Promise<ResponseItemInstanceDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const row = await this.instances.requireInstance(this.instances.db, input);

    return this.presenter.presentOne(access, row);
  }
}
