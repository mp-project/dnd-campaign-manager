import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { AppDatabase } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateCampaignDto,
  toUpdateCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import type { UpdateCampaignDto } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { CAMPAIGN_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaign";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export type UpdateCampaignInput = {
  campaignId: string;
  command: UpdateCampaignDto;
};

export class UpdateCampaignUseCase extends MutationUseCase<
  UpdateCampaignInput,
  ResponseUpdateCampaignDto
> {
  protected readonly action = CAMPAIGN_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly campaignsService: CampaignsService,
  ) {
    super(history);
  }

  protected override async prepare(context: RequestContext): Promise<void> {
    await this.campaignsService.requireActorId(context);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateCampaignInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.campaignsService.assertCanManage(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateCampaignInput,
  ): Promise<ResponseUpdateCampaignDto> {
    const { expectedVersion, slug, ...fields } = input.command;
    const patch: Record<string, unknown> = {
      ...fields,
      ...(slug ? { slug: this.campaignsService.slugify(slug) } : {}),
    };
    const set = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );

    const { row, merged } = await this.campaignsService.withSlugConflict(() =>
      scope.change(this.campaignsService.trackedCampaign, input.campaignId, (current) => {
        this.campaignsService.assertNotArchived(current);

        return { set, baseVersion: expectedVersion };
      }),
    );

    return toUpdateCampaignResponse(
      await this.campaignsService.toAggregate(scope.tx, context, row),
      merged,
    );
  }
}
