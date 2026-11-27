import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatFullDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatContent } from "#src/modules/feats/service/FeatsService";

/** Restores an archived feat, including a release it had; checked again at the end. */
export class RestoreFeatUseCase extends RestoreContentUseCase<FeatContent, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.restore;
  protected readonly toResponse = toFeatFullResponse;
}
