import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpeciesFullDto,
  toSpeciesFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesContent } from "#src/modules/species/service/SpeciesService";

/** Restores an archived species, including a release it had. */
export class RestoreSpeciesUseCase extends RestoreContentUseCase<SpeciesContent, ResponseSpeciesFullDto> {
  protected readonly action = SPECIES_ACTIONS.restore;
  protected readonly toResponse = toSpeciesFullResponse;
}
