import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateSpeciesDto,
  toSpeciesGmResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { UpdateSpeciesDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";

export type UpdateSpeciesInput = {
  campaignId: string | null;
  speciesId: string;
  command: UpdateSpeciesDto;
};

export class UpdateSpeciesUseCase extends MutationUseCase<UpdateSpeciesInput, ResponseUpdateSpeciesDto> {
  protected readonly action = SPECIES_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateSpeciesInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateSpeciesInput,
  ): Promise<ResponseUpdateSpeciesDto> {
    const actorId = this.speciesService.actorIdOf(context);
    const found = await this.speciesService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.speciesService.updateSpecies(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toSpeciesGmResponse(record), merged };
  }
}
