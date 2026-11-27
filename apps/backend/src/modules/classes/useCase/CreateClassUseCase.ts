import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseClassFullDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import type { ClassContent } from "#src/modules/classes/service/ClassesService";

/** `campaignId` null creates a global class, which only administrators may do. */
export class CreateClassUseCase extends CreateContentUseCase<ClassContent, ResponseClassFullDto> {
  protected readonly action = CLASS_ACTIONS.create;
  protected readonly toResponse = toClassFullResponse;
}
