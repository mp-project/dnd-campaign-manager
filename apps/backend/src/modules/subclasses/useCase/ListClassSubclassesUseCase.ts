import type { RequestContext } from "#core/http/requestContext";
import type { SubclassListing } from "#src/modules/subclasses/useCase/SubclassListing";

/** The subclasses of one class in the catalog of a campaign. */
export class ListClassSubclassesUseCase {
  constructor(private readonly listing: SubclassListing) {}

  execute(context: RequestContext, input: { campaignId: string; classId: string }) {
    return this.listing.listForClass(context, input);
  }
}
