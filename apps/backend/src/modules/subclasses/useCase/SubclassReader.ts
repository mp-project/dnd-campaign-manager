import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import type { SubclassDefinition } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import type { SubclassWithAsset } from "#src/modules/subclasses/domain/repository/SubclassesRepository";
import { parseSubclassDefinition } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

/**
 * Where a subclass is read: `campaign` only finds custom subclasses of the campaign, `catalog` also
 * global ones for the campaign ruleset, `system` only global ones.
 */
export type SubclassReadMode = "campaign" | "catalog" | "system";

export type ReadableSubclass = {
  found: SubclassWithAsset;
  view: ContentView;
  /** As the viewer may see it: stripped of hidden references for players. */
  definition: SubclassDefinition;
};

/**
 * Finds a subclass for a read route and decides the view. GMs and editors get the full view of
 * what the campaign may use, players the player view of active subclasses they may see, of classes
 * they may see. Outside a campaign, administrators get the full view of global subclasses and
 * everybody else the player view of active ones.
 */
export class SubclassReader {
  constructor(
    private readonly subclassesService: SubclassesService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: SubclassReadMode,
    input: { campaignId?: string | undefined; subclassId: string },
  ): Promise<ReadableSubclass> {
    const { db } = this.subclassesService;

    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.subclassesService.requireSystemSubclass(db, input.subclassId);

      if (isSysAdminRole(context.systemRole)) {
        return { found, view: "FULL", definition: parseSubclassDefinition(found.subclass) };
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Subclass not found");
      }

      return {
        found,
        view: "PLAYER",
        definition: await this.subclassesService.definitionFor(found, null, db),
      };
    }

    const access = await this.assetsService.access(context, input.campaignId as string);
    const found = await this.subclassesService.requireReadableSubclass(
      access,
      input.subclassId,
      mode === "campaign" ? "MANAGE" : "CATALOG",
    );

    return {
      found,
      view: access.isFullView ? "FULL" : "PLAYER",
      definition: await this.subclassesService.definitionFor(found, access, db),
    };
  }
}
