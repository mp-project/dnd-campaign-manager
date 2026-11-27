import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpeciesFullDto,
  toSpeciesFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesContent } from "#src/modules/species/service/SpeciesService";

/** `campaignId` null creates a global species, which only administrators may do. */
export class CreateSpeciesUseCase extends CreateContentUseCase<SpeciesContent, ResponseSpeciesFullDto> {
  protected readonly action = SPECIES_ACTIONS.create;
  protected readonly toResponse = toSpeciesFullResponse;
}
