import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { ListMyCampaignInvitationsUseCase } from "#src/modules/campaign-invitations/useCase/ListMyCampaignInvitationsUseCase";

export class ListMyCampaignInvitationsController extends AbstractController {
  constructor(private readonly listMyCampaignInvitationsUseCase: ListMyCampaignInvitationsUseCase) {
    super();
  }

  handle = async (request: { requestContext: RequestContext }) =>
    this.execute(async () => this.listMyCampaignInvitationsUseCase.execute(request.requestContext));
}
