import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { ResolveSpellDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import {
  type ResponseSpellDto,
  type ResponseSpellEffectsDto,
  type ResponseSpellListDetailDto,
  type ResponseSpellListsOfSpellDto,
  type ResponseSpellResolutionDto,
  toSpellFullResponse,
  toSpellListFullResponse,
  toSpellListPlayerResponse,
  toSpellPlayerResponse,
  toSpellResolutionResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { resolveSpellCast, SpellCastError } from "#src/modules/spells/domain/SpellCasting";
import { storedSpellIds, storedSpellListIds } from "#src/modules/spells/history/TrackedSpell";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";
import type { ReadableSpell, SpellReader, SpellReadMode } from "#src/modules/spells/useCase/SpellReader";

type SpellInput = { campaignId?: string | undefined; spellId: string };
type CatalogInput = { campaignId: string; spellId: string };
type SpellListInput = { campaignId?: string | undefined; spellListId: string };

const header = (readable: ReadableSpell) => ({
  spellId: readable.found.spell.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

/** The whole spell; the view depends on who reads it, see `SpellReader`. */
export class GetSpellUseCase {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly reader: SpellReader,
    private readonly mode: SpellReadMode,
  ) {}

  async execute(context: RequestContext, input: SpellInput): Promise<ResponseSpellDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "FULL") {
      return toSpellFullResponse(await this.spellsService.loadRecord(this.spellsService.db, readable.found));
    }

    const { definition, isVisible } = await this.reader.definition(readable);

    return toSpellPlayerResponse(readable.found, definition, isVisible);
  }
}

/** Targets, scaling tracks and effects: what the spell does. */
export class GetSpellEffectsUseCase {
  constructor(private readonly reader: SpellReader) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseSpellEffectsDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition } = await this.reader.definition(readable);

    return {
      ...header(readable),
      level: readable.found.spell.level,
      targets: definition.targets,
      scalingTracks: definition.scalingTracks,
      effects: definition.effects,
    };
  }
}

/** The lists the spell belongs to in the campaign, as far as the reader may see them. */
export class GetSpellListsOfSpellUseCase {
  constructor(
    private readonly reader: SpellReader,
    private readonly spellsService: SpellsService,
  ) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseSpellListsOfSpellDto> {
    const readable = await this.reader.read(context, "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Spell not found");
    }

    const named = new Set(storedSpellListIds(readable.found.spell));
    const lists = await this.spellsService.listsOfSpell(readable.access, readable.found);

    return {
      ...header(readable),
      lists: lists.map(({ spellList, asset }) => {
        const entry = storedSpellIds(spellList).includes(readable.found.asset.id);
        const byName = named.has(asset.id);

        return {
          id: spellList.id,
          assetId: asset.id,
          scope: asset.scope,
          code: spellList.code,
          name: asset.title,
          membership: entry && byName ? "BOTH" : entry ? "ENTRY" : "NAMED_BY_SPELL",
        };
      }),
    };
  }
}

/**
 * Resolves one cast for a caster described in the body: slot, scaling and every effect. Nothing
 * is spent or stored; the actor modules keep slots, materials and concentration.
 */
export class ResolveSpellUseCase {
  constructor(private readonly reader: SpellReader) {}

  async execute(
    context: RequestContext,
    input: CatalogInput & { command: ResolveSpellDto },
  ): Promise<ResponseSpellResolutionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    try {
      return toSpellResolutionResponse(
        header(readable),
        resolveSpellCast(readable.found.spell, definition, input.command, isVisible),
      );
    } catch (error) {
      if (error instanceof SpellCastError) {
        throw new ConflictError(error.message, { path: error.path });
      }

      throw error;
    }
  }
}

/**
 * Where a spell or list is used in the current campaign: links and content that refers to it,
 * such as lists holding a spell or classes using a list. Players only see usages whose other end
 * they may see as well. `ownOnly` limits it to custom content, for the management routes.
 */
export class GetSpellUsagesUseCase {
  constructor(
    private readonly reader: SpellReader,
    private readonly spellsService: SpellsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Spell not found");
    }

    return this.spellsService.getUsages(readable.access, readable.found.asset.id);
  }
}

export class GetSpellListUseCase {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly reader: SpellReader,
    private readonly mode: SpellReadMode,
  ) {}

  async execute(context: RequestContext, input: SpellListInput): Promise<ResponseSpellListDetailDto> {
    const readable = await this.reader.readList(context, this.mode, input);

    if (readable.view === "FULL") {
      return toSpellListFullResponse(
        await this.spellsService.loadListRecord(this.spellsService.db, readable.found),
      );
    }

    const isVisible = await this.spellsService.assets.referenceVisibility(
      readable.access,
      storedSpellIds(readable.found.spellList),
    );

    return toSpellListPlayerResponse(readable.found, isVisible);
  }
}

export class GetSpellListUsagesUseCase {
  constructor(
    private readonly reader: SpellReader,
    private readonly spellsService: SpellsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; spellListId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.readList(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Spell list not found");
    }

    return this.spellsService.getUsages(readable.access, readable.found.asset.id);
  }
}
