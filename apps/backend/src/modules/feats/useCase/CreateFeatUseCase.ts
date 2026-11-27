import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatFullDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatContent } from "#src/modules/feats/service/FeatsService";

/** `campaignId` null creates a global feat, which only administrators may do. */
export class CreateFeatUseCase extends CreateContentUseCase<FeatContent, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.create;
  protected readonly toResponse = toFeatFullResponse;
}
