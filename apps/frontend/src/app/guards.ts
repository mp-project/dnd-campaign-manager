import { parseRefSegment } from "@dnd/contracts";
import type { QueryClient } from "@tanstack/vue-query";
import type { RouteLocationNormalized, RouteLocationRaw, Router } from "vue-router";

import { isApiError } from "@/core/api/errors";
import { clearSessionCache } from "@/core/api/queryClient";
import { isAdministrator, type Me, meQuery } from "@/core/auth/session";
import { campaignQuery, campaignSegment, lastCampaignId, rememberCampaign } from "@/core/campaign/campaign";

type GuardResult = true | RouteLocationRaw;

/** Keeps the address the user typed and shows the not-found page there. */
function notFound(to: RouteLocationNormalized): RouteLocationRaw {
  return {
    name: "not-found",
    params: { pathMatch: to.path.slice(1).split("/") },
    query: to.query,
    hash: to.hash,
  };
}

function signIn(to: RouteLocationNormalized): RouteLocationRaw {
  return { name: "auth-login", query: { redirect: to.fullPath } };
}

/**
 * Pages in a campaign: the short id must be valid and the account must see the campaign (else the
 * not-found page, like the API's 404). A wrong or old slug is corrected in place; players asking
 * for the game master's area get the player view (administrators see everything, also as players).
 * A network or server error lets the page show its own state.
 */
async function resolveCampaign(
  to: RouteLocationNormalized,
  queryClient: QueryClient,
  me: Me | undefined,
): Promise<GuardResult> {
  const param = to.params.campaign;
  const ref = typeof param === "string" ? parseRefSegment(param) : null;
  if (!ref) return notFound(to);

  let campaign;
  try {
    // Cached data keeps navigating fast; when it is stale it is checked again in the background, and
    // `watchCampaignAccess` re-runs this guard if the role turned out to have changed.
    campaign = await queryClient.ensureQueryData({ ...campaignQuery(ref.id), revalidateIfStale: true });
  } catch (error) {
    if (isApiError(error) && error.status === 401) return signIn(to);
    if (isApiError(error) && (error.status === 403 || error.status === 404)) {
      if (lastCampaignId.value === ref.id) rememberCampaign(null);
      return notFound(to);
    }
    return true;
  }

  rememberCampaign(campaign.id);
  const segment = campaignSegment(campaign);
  const base = `/k/${param as string}`;
  const rest = to.path.slice(base.length);

  if (to.meta.area === "campaign" && campaign.role === "PLAYER" && !isAdministrator(me)) {
    return { path: `/k/${segment}/spiel`, replace: true };
  }
  if (param !== segment) {
    return { path: `/k/${segment}${rest}`, query: to.query, hash: to.hash, replace: true };
  }
  return true;
}

/**
 * Every page with an area needs a session; without one (401 after the renewal failed) the sign-in
 * follows and comes back afterwards. Pages without an area (old scaffold pages, development) and
 * bare pages are open.
 */
export function installGuards(router: Router, queryClient: QueryClient): void {
  router.beforeEach(async (to): Promise<GuardResult> => {
    const area = to.meta.area;
    if (!area || area === "bare") return true;

    let me: Me | undefined;
    try {
      me = await queryClient.ensureQueryData(meQuery);
    } catch (error) {
      if (isApiError(error) && error.status === 401) return signIn(to);
    }

    return area === "campaign" || area === "player" ? resolveCampaign(to, queryClient, me) : true;
  });
}

/**
 * The session is over (its renewal failed): pages that need one go to the sign-in and come back
 * afterwards, and nothing of the account stays in the cache. The cache is cleared only after the
 * failing requests have settled: clearing it at once cancels them silently, which leaves pages
 * loading forever and the guard without the 401 that sends it to the sign-in.
 */
export function handleSessionExpired(router: Router, queryClient: QueryClient): void {
  setTimeout(() => clearSessionCache(queryClient), 0);
  const current = router.currentRoute.value;
  if (current.meta.area && current.meta.area !== "bare") {
    void router.replace({ name: "auth-login", query: { redirect: current.fullPath } });
  }
}
