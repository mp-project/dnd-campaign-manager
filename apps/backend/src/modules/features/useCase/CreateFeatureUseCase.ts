import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseFeatureFullDto,
  toFeatureFullResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FEATURE_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import type { FeatureContent } from "#src/modules/features/service/FeaturesService";

/** `campaignId` null creates a global feature, which only administrators may do. */
export class CreateFeatureUseCase extends CreateContentUseCase<FeatureContent, ResponseFeatureFullDto> {
  protected readonly action = FEATURE_ACTIONS.create;
  protected readonly toResponse = toFeatureFullResponse;
}
