import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseBackgroundFullDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundContent } from "#src/modules/backgrounds/service/BackgroundsService";

/** Restores an archived background, including a release it had; checked again at the end. */
export class RestoreBackgroundUseCase extends RestoreContentUseCase<BackgroundContent, ResponseBackgroundFullDto> {
  protected readonly action = BACKGROUND_ACTIONS.restore;
  protected readonly toResponse = toBackgroundFullResponse;
}
