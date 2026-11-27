import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseBackgroundFullDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundContent } from "#src/modules/backgrounds/service/BackgroundsService";

/** Changes the background and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateBackgroundUseCase extends UpdateContentUseCase<BackgroundContent, ResponseBackgroundFullDto> {
  protected readonly action = BACKGROUND_ACTIONS.update;
  protected readonly toResponse = toBackgroundFullResponse;
}
