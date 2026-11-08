import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateSpeciesVariantDto } from "#src/modules/species/domain/dto/CreateSpeciesDto";
import {
  type ResponseSpeciesVariantFullDto,
  toSpeciesVariantFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";

/** The variant takes the scope of its species: global for global species, else the campaign. */
export type CreateSpeciesVariantInput = {
  campaignId: string | null;
  speciesId: string;
  command: CreateSpeciesVariantDto;
};

export class CreateSpeciesVariantUseCase extends MutationUseCase<CreateSpeciesVariantInput, ResponseSpeciesVariantFullDto> {
  protected readonly action = SPECIES_ACTIONS.createVariant;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
    private readonly variantsService: SpeciesVariantsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateSpeciesVariantInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateSpeciesVariantInput,
  ): Promise<ResponseSpeciesVariantFullDto> {
    const actorId = this.speciesService.actorIdOf(context);
    const species = await this.speciesService.requireForWrite(scope.tx, input);

    return toSpeciesVariantFullResponse(
      await this.variantsService.createVariant(scope, { actorId, species }, input.command),
    );
  }
}
