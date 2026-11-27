import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSubclassFullDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassContent } from "#src/modules/subclasses/service/SubclassesService";

/** Brings an archived subclass back; its class must not be archived. */
export class RestoreSubclassUseCase extends RestoreContentUseCase<SubclassContent, ResponseSubclassFullDto> {
  protected readonly action = SUBCLASS_ACTIONS.restore;
  protected readonly toResponse = toSubclassFullResponse;
}
