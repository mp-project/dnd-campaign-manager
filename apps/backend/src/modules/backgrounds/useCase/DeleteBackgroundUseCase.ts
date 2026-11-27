import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseBackgroundFullDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundContent } from "#src/modules/backgrounds/service/BackgroundsService";

/** Archives the background; it can be restored. Fails while other content refers to it. */
export class DeleteBackgroundUseCase extends ArchiveContentUseCase<BackgroundContent, ResponseBackgroundFullDto> {
  protected readonly action = BACKGROUND_ACTIONS.delete;
  protected readonly toResponse = toBackgroundFullResponse;
}
