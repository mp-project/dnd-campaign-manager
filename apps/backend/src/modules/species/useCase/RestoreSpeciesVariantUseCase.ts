import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpeciesVariantGmDto,
  toSpeciesVariantGmResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { SpeciesLifecycleCommandDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";

export type RestoreSpeciesVariantInput = {
  campaignId: string | null;
  speciesId: string;
  variantId: string;
  command: SpeciesLifecycleCommandDto;
};

/** Restores an archived variant; its species must not be archived. */
export class RestoreSpeciesVariantUseCase extends MutationUseCase<RestoreSpeciesVariantInput, ResponseSpeciesVariantGmDto> {
  protected readonly action = SPECIES_ACTIONS.restoreVariant;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
    private readonly variantsService: SpeciesVariantsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreSpeciesVariantInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreSpeciesVariantInput,
  ): Promise<ResponseSpeciesVariantGmDto> {
    const species = await this.speciesService.requireForWrite(scope.tx, input);
    const found = await this.variantsService.requireVariantOf(
      scope.tx,
      species.species.id,
      input.variantId,
    );

    return toSpeciesVariantGmResponse(
      await this.variantsService.restoreVariant(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
