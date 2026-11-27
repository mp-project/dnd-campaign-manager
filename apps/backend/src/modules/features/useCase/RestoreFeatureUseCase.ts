import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatureFullDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import type { FeatureContent } from "#src/modules/features/service/FeaturesService";

/** Restores an archived feature, including a release it had. */
export class RestoreFeatureUseCase extends RestoreContentUseCase<FeatureContent, ResponseFeatureFullDto> {
  protected readonly action = FEATURE_ACTIONS.restore;
  protected readonly toResponse = toFeatureFullResponse;
}
