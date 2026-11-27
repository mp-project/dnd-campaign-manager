import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSubclassFullDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassContent } from "#src/modules/subclasses/service/SubclassesService";

/** Archives the subclass; it can be restored. Fails while other content refers to it. */
export class DeleteSubclassUseCase extends ArchiveContentUseCase<SubclassContent, ResponseSubclassFullDto> {
  protected readonly action = SUBCLASS_ACTIONS.delete;
  protected readonly toResponse = toSubclassFullResponse;
}
