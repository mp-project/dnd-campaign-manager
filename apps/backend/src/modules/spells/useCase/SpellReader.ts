import type { RequestContext } from "#core/http/requestContext";
import {
  type AssetsService,
  type ContentReadMode,
  readContent,
  type ReadableContent,
} from "#src/modules/assets/index";
import type { SpellDefinition } from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import type {
  SpellListWithAsset,
  SpellWithAsset,
} from "#src/modules/spells/domain/repository/SpellsRepository";
import { readSpellDefinition } from "#src/modules/spells/history/TrackedSpell";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

export type SpellReadMode = ContentReadMode;

export type ReadableSpell = ReadableContent<SpellWithAsset>;
export type ReadableSpellList = ReadableContent<SpellListWithAsset>;

/** A spell in the catalog of a campaign; the input of the catalog sections. */
export type SpellCatalogInput = { campaignId: string; spellId: string };

/** The ids and the view every catalog section of a spell starts with. */
export const readableSpellHeader = (readable: ReadableSpell) => ({
  spellId: readable.found.spell.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

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

    return readContent(this.assetsService, context, mode, input.campaignId, {
      global: () => this.spellsService.requireScopedSpell(db, { campaignId: null, spellId: input.spellId }),
      readable: (access, purpose) => this.spellsService.requireReadableSpell(access, input.spellId, purpose),
      notFound: "Spell not found",
    });
  }

  async readList(
    context: RequestContext,
    mode: SpellReadMode,
    input: { campaignId?: string | undefined; spellListId: string },
  ): Promise<ReadableSpellList> {
    const { db } = this.spellsService;

    return readContent(this.assetsService, context, mode, input.campaignId, {
      global: () =>
        this.spellsService.requireScopedSpellList(db, { campaignId: null, spellListId: input.spellListId }),
      readable: (access, purpose) =>
        this.spellsService.requireReadableSpellList(access, input.spellListId, purpose),
      notFound: "Spell list not found",
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
}
