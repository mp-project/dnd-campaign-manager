import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import type { BackgroundDefinition } from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import type { BackgroundWithAsset } from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import { readBackgroundDefinition } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

/**
 * Where a background is read: `campaign` only finds custom backgrounds of the campaign, `catalog`
 * also global ones for the campaign ruleset, `system` only global ones.
 */
export type BackgroundReadMode = "campaign" | "catalog" | "system";

export type ReadableBackground = {
  found: BackgroundWithAsset;
  view: ContentView;
  /** Null outside a campaign. */
  access: ContentAccess | null;
  /** As the viewer may see it: the player view leaves out GM-only and hidden content. */
  definition: BackgroundDefinition;
};

/**
 * Finds a background for a read route and decides the view. Owners, editors and administrators get
 * the full view, players the player view of active backgrounds they may see; archived backgrounds
 * stay in the catalog while the campaign still uses them. Outside a campaign, administrators get
 * the full view of global backgrounds and everybody else the player view of active ones. A stored
 * definition that no longer parses is a 409.
 */
export class BackgroundReader {
  constructor(
    private readonly backgroundsService: BackgroundsService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: BackgroundReadMode,
    input: { campaignId?: string | undefined; backgroundId: string },
  ): Promise<ReadableBackground> {
    const { db } = this.backgroundsService;

    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.backgroundsService.requireSystemBackground(db, input.backgroundId);
      const definition = readBackgroundDefinition(found.background);

      if (isSysAdminRole(context.systemRole)) {
        return { found, view: "FULL", access: null, definition };
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Background not found");
      }

      return {
        found,
        view: "PLAYER",
        access: null,
        definition: (await this.backgroundsService.playerDefinition(db, definition, null)).definition,
      };
    }

    const access = await this.assetsService.access(context, input.campaignId as string);
    const found = await this.backgroundsService.requireReadableBackground(
      access,
      input.backgroundId,
      mode === "campaign" ? "MANAGE" : "CATALOG",
    );
    const definition = readBackgroundDefinition(found.background);

    if (access.isFullView) {
      return { found, view: "FULL", access, definition };
    }

    return {
      found,
      view: "PLAYER",
      access,
      definition: (await this.backgroundsService.playerDefinition(db, definition, access)).definition,
    };
  }
}
