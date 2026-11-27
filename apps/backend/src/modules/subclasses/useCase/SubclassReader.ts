import type { ContentView } from "#core/content/viewer";
import type { RequestContext } from "#core/http/requestContext";
import { type AssetsService, type ContentReadMode, readContent } from "#src/modules/assets/index";
import type { SubclassDefinition } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import type { SubclassWithAsset } from "#src/modules/subclasses/domain/repository/SubclassesRepository";
import { parseSubclassDefinition } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

export type SubclassReadMode = ContentReadMode;

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
    const { found, view, access } = await readContent(this.assetsService, context, mode, input.campaignId, {
      global: () => this.subclassesService.requireSystemSubclass(db, input.subclassId),
      readable: (access, purpose) =>
        this.subclassesService.requireReadableSubclass(access, input.subclassId, purpose),
      notFound: "Subclass not found",
    });

    return {
      found,
      view,
      // Administrators reading global content get the stored definition as it is.
      definition:
        access === null && view === "FULL"
          ? parseSubclassDefinition(found.subclass)
          : await this.subclassesService.definitionFor(found, access, db),
    };
  }
}
