import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpeciesFullDto,
  toSpeciesFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesContent } from "#src/modules/species/service/SpeciesService";

/** Archives the species; it can be restored. Fails while variants or other definitions refer to it. */
export class DeleteSpeciesUseCase extends ArchiveContentUseCase<SpeciesContent, ResponseSpeciesFullDto> {
  protected readonly action = SPECIES_ACTIONS.delete;
  protected readonly toResponse = toSpeciesFullResponse;
}
