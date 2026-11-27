import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseBackgroundFullDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundContent } from "#src/modules/backgrounds/service/BackgroundsService";

/** `campaignId` null creates a global background, which only administrators may do. */
export class CreateBackgroundUseCase extends CreateContentUseCase<BackgroundContent, ResponseBackgroundFullDto> {
  protected readonly action = BACKGROUND_ACTIONS.create;
  protected readonly toResponse = toBackgroundFullResponse;
}
