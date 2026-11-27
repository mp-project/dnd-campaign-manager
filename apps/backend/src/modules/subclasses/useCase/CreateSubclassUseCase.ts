import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSubclassFullDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassContent } from "#src/modules/subclasses/service/SubclassesService";

/** `campaignId` null creates a global subclass, which only administrators may do. */
export class CreateSubclassUseCase extends CreateContentUseCase<SubclassContent, ResponseSubclassFullDto> {
  protected readonly action = SUBCLASS_ACTIONS.create;
  protected readonly toResponse = toSubclassFullResponse;
}
