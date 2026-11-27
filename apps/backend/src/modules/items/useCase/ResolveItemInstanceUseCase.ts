import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { ResolveItemInstanceDto } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ResponseItemResolutionDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import { readItemDefinition } from "#src/modules/items/history/TrackedItem";
import {
  effectiveKnowledge,
  type ItemInstancesService,
} from "#src/modules/items/service/ItemInstancesService";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import type { ItemInstancePath } from "#src/modules/items/useCase/ItemInstanceMutation";

/**
 * What the instance gives its holder in its stored state (carried while an actor has it,
 * equipped, attuned, charges left) for the actor described in the body. Players need to have
 * identified the instance.
 */
export class ResolveItemInstanceUseCase {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: ItemInstancePath & { command: ResolveItemInstanceDto },
  ): Promise<ResponseItemResolutionDto> {
    const { db } = this.instances;
    const access = await this.assetsService.access(context, input.campaignId);
    const row = await this.instances.requireInstance(db, input);
    const found = await this.instances.definitionOf(db, row);

    if (!access.isFullView) {
      const knowledge = await this.instances.knowledgeOf(db, [row.id]);

      if (effectiveKnowledge(knowledge.get(row.id) ?? [], access.viewer.actorId)?.knowledgeLevel !== "IDENTIFIED") {
        throw new NotFoundError("Item instance not found");
      }
    }

    const definition = readItemDefinition(found.item);
    const isVisible = access.isFullView
      ? () => true
      : await this.itemsService.playerReferenceVisibility(definition, access);
    const resolved = await this.itemsService.resolve(found, {
      actor: input.command.actor,
      state: {
        carried: row.ownerType === "ACTOR",
        equipped: row.equipped,
        attuned: row.attuned,
        currentCharges: row.currentCharges,
      },
      attack: input.command.attack,
      definition,
      access,
      isVisible,
    });

    return {
      itemId: found.item.id,
      assetId: found.asset.id,
      view: access.isFullView ? "FULL" : "PLAYER",
      instanceId: row.id,
      ...resolved,
    } as ResponseItemResolutionDto;
  }
}
