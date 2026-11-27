import type { ContentView } from "#core/content/viewer";
import type { RequestContext } from "#core/http/requestContext";
import { type AssetsService, type ContentReadMode, readContent } from "#src/modules/assets/index";
import type { ClassWithAsset } from "#src/modules/classes/domain/repository/ClassesRepository";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

export type ClassReadMode = ContentReadMode;

export type ReadableClass = {
  found: ClassWithAsset;
  view: ContentView;
  /** For the player view; always true for GMs. */
  isVisible: (assetId: string) => boolean;
};

/**
 * Finds a class for a read route and decides the view. GMs and editors get the full view of what
 * the campaign may use, players the player view of active classes they may see. Archived classes
 * stay in the catalog while the campaign still uses them. Outside a campaign, administrators get
 * the full view of global classes and everybody else the player view of active ones.
 */
export class ClassReader {
  constructor(
    private readonly classesService: ClassesService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: ClassReadMode,
    input: { campaignId?: string | undefined; classId: string },
  ): Promise<ReadableClass> {
    const { db } = this.classesService;
    const { found, view, access } = await readContent(this.assetsService, context, mode, input.campaignId, {
      global: () => this.classesService.requireSystemClass(db, input.classId),
      readable: (access, purpose) => this.classesService.requireReadableClass(access, input.classId, purpose),
      notFound: "Class not found",
    });

    return {
      found,
      view,
      isVisible:
        view === "FULL" ? () => true : await this.classesService.playerReferenceVisibility(db, [found], access),
    };
  }
}
