import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpeciesVariantFullDto,
  toSpeciesVariantFullResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { SpeciesLifecycleCommandDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import { SPECIES_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";

export type DeleteSpeciesVariantInput = {
  campaignId: string | null;
  speciesId: string;
  variantId: string;
  command: SpeciesLifecycleCommandDto;
};

/** Archives the variant; it can be restored. */
export class DeleteSpeciesVariantUseCase extends MutationUseCase<DeleteSpeciesVariantInput, ResponseSpeciesVariantFullDto> {
  protected readonly action = SPECIES_ACTIONS.deleteVariant;

  constructor(
    history: HistoryPort,
    private readonly speciesService: SpeciesService,
    private readonly variantsService: SpeciesVariantsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteSpeciesVariantInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteSpeciesVariantInput,
  ): Promise<ResponseSpeciesVariantFullDto> {
    const species = await this.speciesService.requireForWrite(scope.tx, input);
    const found = await this.variantsService.requireVariantOf(
      scope.tx,
      species.species.id,
      input.variantId,
    );

    return toSpeciesVariantFullResponse(
      await this.variantsService.archiveVariant(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
