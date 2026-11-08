import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateSpeciesVariantDto,
  toSpeciesVariantFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { UpdateSpeciesVariantDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";

export type UpdateSpeciesVariantInput = {
  campaignId: string | null;
  speciesId: string;
  variantId: string;
  command: UpdateSpeciesVariantDto;
};

export class UpdateSpeciesVariantUseCase extends MutationUseCase<UpdateSpeciesVariantInput, ResponseUpdateSpeciesVariantDto> {
  protected readonly action = SPECIES_ACTIONS.updateVariant;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
    private readonly variantsService: SpeciesVariantsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateSpeciesVariantInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateSpeciesVariantInput,
  ): Promise<ResponseUpdateSpeciesVariantDto> {
    const actorId = this.speciesService.actorIdOf(context);
    const species = await this.speciesService.requireForWrite(scope.tx, input);
    const found = await this.variantsService.requireVariantOf(
      scope.tx,
      species.species.id,
      input.variantId,
    );
    const { record, merged } = await this.variantsService.updateVariant(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toSpeciesVariantFullResponse(record), merged };
  }
}
