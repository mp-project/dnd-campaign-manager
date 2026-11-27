import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatureFullDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import type { FeatureContent } from "#src/modules/features/service/FeaturesService";

/** Archives the feature; it can be restored. Fails while other definitions refer to it. */
export class DeleteFeatureUseCase extends ArchiveContentUseCase<FeatureContent, ResponseFeatureFullDto> {
  protected readonly action = FEATURE_ACTIONS.delete;
  protected readonly toResponse = toFeatureFullResponse;
}
