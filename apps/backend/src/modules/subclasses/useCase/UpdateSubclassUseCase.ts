import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSubclassFullDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassContent } from "#src/modules/subclasses/service/SubclassesService";

/** Changes the subclass and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateSubclassUseCase extends UpdateContentUseCase<SubclassContent, ResponseSubclassFullDto> {
  protected readonly action = SUBCLASS_ACTIONS.update;
  protected readonly toResponse = toSubclassFullResponse;
}
