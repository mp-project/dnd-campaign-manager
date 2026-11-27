import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpeciesFullDto,
  toSpeciesFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesContent } from "#src/modules/species/service/SpeciesService";

/** Changes the species and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateSpeciesUseCase extends UpdateContentUseCase<SpeciesContent, ResponseSpeciesFullDto> {
  protected readonly action = SPECIES_ACTIONS.update;
  protected readonly toResponse = toSpeciesFullResponse;
}
