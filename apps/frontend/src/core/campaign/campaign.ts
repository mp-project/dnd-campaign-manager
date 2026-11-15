import { parseRefSegment, toRefSegment } from "@dnd/contracts";
import { queryOptions, useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { cachePolicy } from "@/core/api/cachePolicy";
import { api, type ApiData, unwrap } from "@/core/api/client";
import { isApiError } from "@/core/api/errors";
import { campaignKey, globalKey, meKey } from "@/core/api/queryClient";

/**
 * The campaign a page works in. It comes from the URL (`/k/<short id>-<slug>/...`); pages outside
 * a campaign (dashboard, account) keep the last opened one, so the navigation still leads back.
 */

export type Campaign = ApiData<"getCampaignById">;
export type CampaignRole = NonNullable<Campaign["role"]>;

/**
 * How often the open campaign is checked for a changed role or a lost membership, until the
 * realtime channel reports those changes.
 */
export const CAMPAIGN_ACCESS_CHECK_MS = 60_000;

/** The campaign with the viewer's role and permissions: role-dependent, so kept briefly. */
export function campaignQuery(campaignId: string) {
  return queryOptions({
    queryKey: campaignKey(campaignId, "detail"),
    queryFn: (): Promise<Campaign> => unwrap(api.GET("/api/v1/campaigns/{campaignId}", { params: { path: { campaignId } } })),
    ...cachePolicy("private"),
  });
}

/** The campaigns of the signed-in account (switcher, dashboard). */
export const myCampaignsQuery = queryOptions({
  queryKey: meKey("campaigns"),
  queryFn: () => unwrap(api.GET("/api/v1/campaigns", { params: { query: { limit: 100 } } })),
  ...cachePolicy("list"),
});

export function useMyCampaigns() {
  return useQuery(myCampaignsQuery);
}

/** URL segment of a campaign; only the short id counts, the slug is for people. */
export function campaignSegment(campaign: Pick<Campaign, "id" | "slug">): string {
  return toRefSegment(campaign.id, campaign.slug);
}

/** Players get the player view; game master, editors and administrators the campaign area. */
export function campaignHomePath(campaign: Pick<Campaign, "id" | "slug" | "role">): string {
  const base = `/k/${campaignSegment(campaign)}`;
  return campaign.role === "PLAYER" ? `${base}/spiel` : base;
}

const LAST_CAMPAIGN_KEY = "chronik.campaign";

function readLastCampaign(): string | null {
  try {
    return localStorage.getItem(LAST_CAMPAIGN_KEY);
  } catch {
    return null;
  }
}

/** Id of the campaign opened last in this browser; outlives reloads, never leaves the browser. */
export const lastCampaignId = ref<string | null>(readLastCampaign());

export function rememberCampaign(campaignId: string | null): void {
  lastCampaignId.value = campaignId;
  try {
    if (campaignId) localStorage.setItem(LAST_CAMPAIGN_KEY, campaignId);
    else localStorage.removeItem(LAST_CAMPAIGN_KEY);
  } catch {
    // Without storage the campaign is only remembered until the page is reloaded.
  }
}

/** The id in the URL, or null when the route has none or it isn't a valid short id. */
export function campaignIdOfParam(param: unknown): string | null {
  return typeof param === "string" ? (parseRefSegment(param)?.id ?? null) : null;
}

/**
 * The current campaign: the one in the URL, else the one opened last. `inUrl` tells which;
 * a remembered campaign that can't be loaded any more (left, archived, deleted) is forgotten.
 */
export function useCurrentCampaign() {
  const route = useRoute();
  const fromUrl = computed(() => campaignIdOfParam(route.params.campaign));
  const campaignId = computed(() => fromUrl.value ?? lastCampaignId.value);
  const query = useQuery(
    computed(() => ({
      ...campaignQuery(campaignId.value ?? ""),
      enabled: campaignId.value !== null,
      // Only the campaign a page works in; the remembered one of account pages needs no check.
      refetchInterval: fromUrl.value ? CAMPAIGN_ACCESS_CHECK_MS : (false as const),
    })),
  );
  const campaign = computed(() => (campaignId.value && !query.isError.value ? (query.data.value ?? null) : null));

  watch(query.error, (error) => {
    // Only the remembered one: 403/404 mean it is gone for this account (network errors don't).
    if (!fromUrl.value && isApiError(error) && (error.status === 403 || error.status === 404)) {
      rememberCampaign(null);
    }
  });

  return {
    campaignId,
    campaign,
    role: computed<CampaignRole | null>(() => campaign.value?.role ?? null),
    inUrl: computed(() => fromUrl.value !== null),
    segment: computed(() => (campaign.value ? campaignSegment(campaign.value) : null)),
  };
}

export type Ruleset = ApiData<"getRulesetById">;

/** A ruleset rarely changes; the shell shows the campaign's by name. */
export function rulesetQuery(rulesetId: string) {
  return queryOptions({
    queryKey: globalKey("rulesets", rulesetId),
    queryFn: (): Promise<Ruleset> =>
      unwrap(api.GET("/api/v1/ruleset/{rulesetId}", { params: { path: { rulesetId } } })),
    ...cachePolicy("static"),
  });
}

export function useRuleset(rulesetId: () => string | null | undefined) {
  return useQuery(
    computed(() => ({ ...rulesetQuery(rulesetId() ?? ""), enabled: !!rulesetId() })),
  );
}

/**
 * Message key of a campaign role ("Spielleitung", "Mitwirkend", "Spieler").
 * i18n-dynamic: common.roles.*
 */
export function roleMessageKey(role: CampaignRole): `common.roles.${CampaignRole}` {
  return `common.roles.${role}`;
}
