import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateSpeciesDto } from "#src/modules/species/domain/dto/CreateSpeciesDto";
import {
  type ResponseSpeciesGmDto,
  toSpeciesGmResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";

/** `campaignId` null creates a global species, which only administrators may do. */
export type CreateSpeciesInput = { campaignId: string | null; command: CreateSpeciesDto };

export class CreateSpeciesUseCase extends MutationUseCase<CreateSpeciesInput, ResponseSpeciesGmDto> {
  protected readonly action = SPECIES_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateSpeciesInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateSpeciesInput,
  ): Promise<ResponseSpeciesGmDto> {
    const actorId = this.speciesService.actorIdOf(context);

    return toSpeciesGmResponse(
      await this.speciesService.createSpecies(
        scope,
        { actorId, campaignId: input.campaignId },
        input.command,
      ),
    );
  }
}
