import type { ContentView } from "#core/content/viewer";
import type { RequestContext } from "#core/http/requestContext";
import {
  type AssetsService,
  type ContentAccess,
  type ContentReadMode,
  readContent,
} from "#src/modules/assets/index";
import type { BackgroundDefinition } from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import type { BackgroundWithAsset } from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import { readBackgroundDefinition } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

export type BackgroundReadMode = ContentReadMode;

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
    const readable = await readContent(this.assetsService, context, mode, input.campaignId, {
      global: () => this.backgroundsService.requireSystemBackground(db, input.backgroundId),
      readable: (access, purpose) =>
        this.backgroundsService.requireReadableBackground(access, input.backgroundId, purpose),
      notFound: "Background not found",
    });
    const definition = readBackgroundDefinition(readable.found.background);

    if (readable.view === "FULL") {
      return { ...readable, definition };
    }

    return {
      ...readable,
      definition: (await this.backgroundsService.playerDefinition(db, definition, readable.access)).definition,
    };
  }
}
