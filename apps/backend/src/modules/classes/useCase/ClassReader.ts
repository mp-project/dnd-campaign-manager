import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import type { ClassWithAsset } from "#src/modules/classes/domain/repository/ClassesRepository";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

/**
 * Where a class is read: `campaign` only finds custom classes of the campaign, `catalog` also
 * global ones for the campaign ruleset, `system` only global ones.
 */
export type ClassReadMode = "campaign" | "catalog" | "system";

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

    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.classesService.requireSystemClass(db, input.classId);

      if (isSysAdminRole(context.systemRole)) {
        return { found, view: "FULL", isVisible: () => true };
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Class not found");
      }

      return {
        found,
        view: "PLAYER",
        isVisible: await this.classesService.playerReferenceVisibility(db, [found], null),
      };
    }

    const access = await this.assetsService.access(context, input.campaignId as string);
    const found = await this.classesService.requireReadableClass(
      access,
      input.classId,
      mode === "campaign" ? "MANAGE" : "CATALOG",
    );

    if (access.isFullView) {
      return { found, view: "FULL", isVisible: () => true };
    }

    return {
      found,
      view: "PLAYER",
      isVisible: await this.classesService.playerReferenceVisibility(db, [found], access),
    };
  }
}
