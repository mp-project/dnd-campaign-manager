import type { SQL } from "drizzle-orm";

import { type AssetsService, ContentListing } from "#src/modules/assets/index";
import type {
  RequestCampaignClassesQueryDto,
  RequestClassCatalogQueryDto,
  RequestSystemClassesQueryDto,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import {
  type ResponseClassListDto,
  toClassListItemFullResponse,
  toClassListItemPlayerResponse,
  toClassListResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import type { ClassListFilter, ClassPage } from "#src/modules/classes/domain/repository/ClassesRepository";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

/** The types of the class lists for `ContentListing`. */
type ClassListTypes = {
  campaignQuery: RequestCampaignClassesQueryDto;
  catalogQuery: RequestClassCatalogQueryDto;
  systemQuery: RequestSystemClassesQueryDto;
  filter: Omit<ClassListFilter, "where">;
  page: ClassPage;
  response: ResponseClassListDto;
};

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class ClassListing extends ContentListing<ClassListTypes> {
  constructor(
    private readonly classesService: ClassesService,
    assetsService: AssetsService,
  ) {
    super(assetsService);
  }

  protected filterOf(query: RequestCampaignClassesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      hitDie: query.hitDie,
      spellcastingType: query.spellcastingType,
      search: query.search,
    };
  }

  protected listPage(filter: ClassListTypes["filter"] & { where: SQL }): Promise<ClassPage> {
    return this.classesService.repository.listPage(this.classesService.db, filter);
  }

  protected async toResponse(
    page: ClassPage,
    fullView: boolean,
    limit: number,
  ): Promise<ResponseClassListDto> {
    if (!fullView) {
      return toClassListResponse({
        page,
        data: page.items.map(toClassListItemPlayerResponse),
        limit,
      });
    }

    const records = await this.classesService.loadRecords(this.classesService.db, page.items);

    return toClassListResponse({ page, data: records.map(toClassListItemFullResponse), limit });
  }
}
