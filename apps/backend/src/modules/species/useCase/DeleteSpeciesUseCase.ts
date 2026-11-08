import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpeciesGmDto,
  toSpeciesGmResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesLifecycleCommandDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";

export type DeleteSpeciesInput = {
  campaignId: string | null;
  speciesId: string;
  command: SpeciesLifecycleCommandDto;
};

/** Archives the species; it can be restored. Fails while variants or other definitions refer to it. */
export class DeleteSpeciesUseCase extends MutationUseCase<DeleteSpeciesInput, ResponseSpeciesGmDto> {
  protected readonly action = SPECIES_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteSpeciesInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteSpeciesInput,
  ): Promise<ResponseSpeciesGmDto> {
    const found = await this.speciesService.requireForWrite(scope.tx, input);

    return toSpeciesGmResponse(
      await this.speciesService.archiveSpecies(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
