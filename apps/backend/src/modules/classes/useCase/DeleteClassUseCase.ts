import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseClassFullDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import type { ClassContent } from "#src/modules/classes/service/ClassesService";

/** Archives the class; it can be restored. Fails while other definitions refer to it. */
export class DeleteClassUseCase extends ArchiveContentUseCase<ClassContent, ResponseClassFullDto> {
  protected readonly action = CLASS_ACTIONS.delete;
  protected readonly toResponse = toClassFullResponse;
}
