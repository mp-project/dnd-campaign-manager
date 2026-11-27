import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatFullDto,
  toFeatFullResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import { FEAT_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import type { FeatContent } from "#src/modules/feats/service/FeatsService";

/** Archives the feat; it can be restored. Fails while other content refers to it. */
export class DeleteFeatUseCase extends ArchiveContentUseCase<FeatContent, ResponseFeatFullDto> {
  protected readonly action = FEAT_ACTIONS.delete;
  protected readonly toResponse = toFeatFullResponse;
}
