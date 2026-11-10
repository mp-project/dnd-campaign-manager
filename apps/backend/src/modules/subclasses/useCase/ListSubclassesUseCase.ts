import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import type { ClassesService } from "#src/modules/classes/index";
import type {
  RequestCampaignSubclassesQueryDto,
  RequestSystemSubclassesQueryDto,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import {
  type ResponseClassSubclassesDto,
  type ResponseSubclassListDto,
  type ResponseSubclassListItemDto,
  toSubclassListItemFullResponse,
  toSubclassListItemPlayerResponse,
  toSubclassListResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { SubclassWithAsset } from "#src/modules/subclasses/domain/repository/SubclassesRepository";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class SubclassListing {
  constructor(
    private readonly subclassesService: SubclassesService,
    private readonly classesService: ClassesService,
    private readonly assetsService: AssetsService,
  ) {}

  /**
   * The campaign's own subclasses. Players get released active ones of classes they may see; a
   * page may then hold fewer entries than the limit.
   */
  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignSubclassesQueryDto },
  ): Promise<ResponseSubclassListDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { db, repository } = this.subclassesService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(input.query),
      where: access.listWhere("MANAGE", { status: input.query.status }),
    });
    const items = await this.subclassesService.filterByReadableClass(access, page.items, "MANAGE");

    return toSubclassListResponse({
      page,
      data: await this.toItems(items, access.isFullView),
      limit: input.query.limit,
    });
  }

  /**
   * The subclasses a campaign may choose for one class of its catalog: active global ones for its
   * ruleset and its own (for players only released ones), plus archived ones the campaign still
   * uses, marked `selectable: false`. A class the viewer may not see is 404.
   */
  async listForClass(
    context: RequestContext,
    input: { campaignId: string; classId: string },
  ): Promise<ResponseClassSubclassesDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const base = await this.classesService.requireReadableClass(access, input.classId, "CATALOG");
    const items = await this.subclassesService.listReadableForClass(
      access,
      base.characterClass.id,
      "CATALOG",
    );

    return {
      classId: base.characterClass.id,
      classAssetId: base.asset.id,
      selectionLevel: base.characterClass.subclassSelectionLevel,
      data: await this.toItems(items, access.isFullView),
    };
  }

  /** Global subclasses; drafts and archived ones for administrators only. */
  async listSystem(
    context: RequestContext,
    query: RequestSystemSubclassesQueryDto,
  ): Promise<ResponseSubclassListDto> {
    this.assetsService.assertAuthenticated(context);

    const { db, repository } = this.subclassesService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return toSubclassListResponse({
      page,
      data: await this.toItems(page.items, isSysAdminRole(context.systemRole)),
      limit: query.limit,
    });
  }

  private baseFilter(query: RequestCampaignSubclassesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      classId: query.classId,
      search: query.search,
    };
  }

  private async toItems(
    items: readonly SubclassWithAsset[],
    fullView: boolean,
  ): Promise<ResponseSubclassListItemDto[]> {
    if (!fullView) {
      return items.map(toSubclassListItemPlayerResponse);
    }

    const records = await this.subclassesService.loadRecords(this.subclassesService.db, items);

    return records.map(toSubclassListItemFullResponse);
  }
}

/** Custom subclasses of a campaign. */
export class ListCampaignSubclassesUseCase {
  constructor(private readonly listing: SubclassListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignSubclassesQueryDto },
  ) {
    return this.listing.listCampaign(context, input);
  }
}

/** The subclasses of one class in the catalog of a campaign. */
export class ListClassSubclassesUseCase {
  constructor(private readonly listing: SubclassListing) {}

  execute(context: RequestContext, input: { campaignId: string; classId: string }) {
    return this.listing.listForClass(context, input);
  }
}

/** Global subclasses; drafts and archived ones for administrators only. */
export class ListSystemSubclassesUseCase {
  constructor(private readonly listing: SubclassListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSubclassesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
