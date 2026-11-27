import type { ContentReadPurpose } from "#core/content/access";
import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/service/AssetsService";
import type { ContentAccess } from "#src/modules/assets/service/ContentAccess";

/**
 * Where content is read: `campaign` only finds the campaign's own content (its management
 * routes), `catalog` also global content for the campaign ruleset, `system` only global content.
 */
export type ContentReadMode = "campaign" | "catalog" | "system";

export type ReadableContent<Found> = {
  found: Found;
  view: ContentView;
  /** Null outside a campaign. */
  access: ContentAccess | null;
};

/** How a module finds one piece of its content, globally or in a campaign. */
export type ContentLookups<Found> = {
  global(): Promise<Found>;
  readable(access: ContentAccess, purpose: ContentReadPurpose): Promise<Found>;
  /** The message of the 404 for global content a non-administrator may not see. */
  notFound: string;
};

/** The purpose a read in a campaign asks the access session for: `MANAGE` for its own routes. */
export function contentReadPurposeOf(mode: ContentReadMode): ContentReadPurpose {
  return mode === "campaign" ? "MANAGE" : "CATALOG";
}

/**
 * Finds content for a read route and decides the view. In a campaign the access session decides
 * (owners, editors and administrators get the full view, players the player view of what they may
 * see; archived content stays in the catalog while the campaign uses it). Outside a campaign,
 * administrators get the full view of global content and everybody else the player view of active
 * content; anything else is a 404.
 */
export async function readContent<Found extends { asset: { status: string } }>(
  assets: AssetsService,
  context: RequestContext,
  mode: ContentReadMode,
  campaignId: string | undefined,
  lookups: ContentLookups<Found>,
): Promise<ReadableContent<Found>> {
  if (mode === "system") {
    assets.assertAuthenticated(context);

    const found = await lookups.global();

    if (isSysAdminRole(context.systemRole)) {
      return { found, view: "FULL", access: null };
    }

    if (found.asset.status !== "ACTIVE") {
      throw new NotFoundError(lookups.notFound);
    }

    return { found, view: "PLAYER", access: null };
  }

  const access = await assets.access(context, campaignId as string);
  const found = await lookups.readable(access, contentReadPurposeOf(mode));

  return { found, view: access.isFullView ? "FULL" : "PLAYER", access };
}
