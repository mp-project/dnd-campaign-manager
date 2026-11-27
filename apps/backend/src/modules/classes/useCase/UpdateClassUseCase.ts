import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseClassFullDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import type { ClassContent } from "#src/modules/classes/service/ClassesService";

/** Changes the class and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateClassUseCase extends UpdateContentUseCase<ClassContent, ResponseClassFullDto> {
  protected readonly action = CLASS_ACTIONS.update;
  protected readonly toResponse = toClassFullResponse;
}
