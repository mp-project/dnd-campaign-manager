import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseClassFullDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import type { ClassContent } from "#src/modules/classes/service/ClassesService";

/** Restores an archived class, including a release it had. */
export class RestoreClassUseCase extends RestoreContentUseCase<ClassContent, ResponseClassFullDto> {
  protected readonly action = CLASS_ACTIONS.restore;
  protected readonly toResponse = toClassFullResponse;
}
