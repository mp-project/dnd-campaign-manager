import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetRow, AssetsService, ContentAccess } from "#src/modules/assets/index";
import type { SpellDefinition } from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import type {
  SpellListWithAsset,
  SpellWithAsset,
} from "#src/modules/spells/domain/repository/SpellsRepository";
import { readSpellDefinition } from "#src/modules/spells/history/TrackedSpell";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

/**
 * Where content is read: `campaign` only finds custom content of the campaign, `catalog` also
 * global content for the campaign ruleset, `system` only global content.
 */
export type SpellReadMode = "campaign" | "catalog" | "system";

export type Readable<T> = {
  found: T;
  view: ContentView;
  /** Null outside a campaign. */
  access: ContentAccess | null;
};

export type ReadableSpell = Readable<SpellWithAsset>;
export type ReadableSpellList = Readable<SpellListWithAsset>;

/**
 * Finds a spell or a spell list for a read route and decides the view. Owners, editors and
 * administrators get the full view, players the player view of active content they may see;
 * archived content stays in the catalog while the campaign still uses it. Outside a campaign,
 * administrators get the full view of global content and everybody else the player view of active
 * content.
 */
export class SpellReader {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: SpellReadMode,
    input: { campaignId?: string | undefined; spellId: string },
  ): Promise<ReadableSpell> {
    const { db } = this.spellsService;

    return this.readWith(context, mode, input.campaignId, {
      global: () => this.spellsService.requireScopedSpell(db, { campaignId: null, spellId: input.spellId }),
      readable: (access, purpose) => this.spellsService.requireReadableSpell(access, input.spellId, purpose),
      message: "Spell not found",
    });
  }

  async readList(
    context: RequestContext,
    mode: SpellReadMode,
    input: { campaignId?: string | undefined; spellListId: string },
  ): Promise<ReadableSpellList> {
    const { db } = this.spellsService;

    return this.readWith(context, mode, input.campaignId, {
      global: () =>
        this.spellsService.requireScopedSpellList(db, { campaignId: null, spellListId: input.spellListId }),
      readable: (access, purpose) =>
        this.spellsService.requireReadableSpellList(access, input.spellListId, purpose),
      message: "Spell list not found",
    });
  }

  /** The stored definition (409 if it no longer parses) and what of it the reader may see. */
  async definition(
    readable: ReadableSpell,
  ): Promise<{ definition: SpellDefinition; isVisible: (assetId: string) => boolean }> {
    const definition = readSpellDefinition(readable.found.spell);

    if (readable.view === "FULL") {
      return { definition, isVisible: () => true };
    }

    return {
      definition,
      isVisible: await this.spellsService.playerReferenceVisibility(
        this.spellsService.db,
        readable.found.spell,
        definition,
        readable.access,
      ),
    };
  }

  private async readWith<T extends { asset: AssetRow }>(
    context: RequestContext,
    mode: SpellReadMode,
    campaignId: string | undefined,
    lookups: {
      global(): Promise<T>;
      readable(access: ContentAccess, purpose: "MANAGE" | "CATALOG"): Promise<T>;
      message: string;
    },
  ): Promise<Readable<T>> {
    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await lookups.global();

      if (isSysAdminRole(context.systemRole)) {
        return { found, view: "FULL", access: null };
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError(lookups.message);
      }

      return { found, view: "PLAYER", access: null };
    }

    const access = await this.assetsService.access(context, campaignId as string);
    const found = await lookups.readable(access, mode === "campaign" ? "MANAGE" : "CATALOG");

    return { found, view: access.isFullView ? "FULL" : "PLAYER", access };
  }
}
