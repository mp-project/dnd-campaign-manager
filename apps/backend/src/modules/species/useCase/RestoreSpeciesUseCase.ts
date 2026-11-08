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

export type RestoreSpeciesInput = {
  campaignId: string | null;
  speciesId: string;
  command: SpeciesLifecycleCommandDto;
};

/** Restores an archived species, including a release it had. */
export class RestoreSpeciesUseCase extends MutationUseCase<RestoreSpeciesInput, ResponseSpeciesGmDto> {
  protected readonly action = SPECIES_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreSpeciesInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreSpeciesInput,
  ): Promise<ResponseSpeciesGmDto> {
    const found = await this.speciesService.requireForWrite(scope.tx, input);

    return toSpeciesGmResponse(
      await this.speciesService.restoreSpecies(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
