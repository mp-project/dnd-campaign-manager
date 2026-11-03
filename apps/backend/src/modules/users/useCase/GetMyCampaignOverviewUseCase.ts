import type { RequestContext } from "#core/http/requestContext";
import type { ResponseMeCampaignOverviewDto } from "#src/modules/users/domain/dto/ResponseUsersDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class GetMyCampaignOverviewUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(context: RequestContext): Promise<ResponseMeCampaignOverviewDto> {
    this.usersService.assertAuthenticated(context);

    return {
      ownedOrManaged: [],
      joined: [],
    };
  }
}
