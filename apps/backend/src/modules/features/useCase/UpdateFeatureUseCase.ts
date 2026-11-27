import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatureFullDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import type { FeatureContent } from "#src/modules/features/service/FeaturesService";

/** Changes the feature and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateFeatureUseCase extends UpdateContentUseCase<FeatureContent, ResponseFeatureFullDto> {
  protected readonly action = FEATURE_ACTIONS.update;
  protected readonly toResponse = toFeatureFullResponse;
}
