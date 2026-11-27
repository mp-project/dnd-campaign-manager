import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatFullDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatContent } from "#src/modules/feats/service/FeatsService";

/** Changes the feat and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateFeatUseCase extends UpdateContentUseCase<FeatContent, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.update;
  protected readonly toResponse = toFeatFullResponse;
}
