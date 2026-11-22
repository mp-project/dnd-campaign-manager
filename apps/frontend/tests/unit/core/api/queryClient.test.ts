import { describe, expect, it } from "vitest";

import { CACHE_POLICY, SIGNED_URL_MARGIN_MS, signedUrlStaleTime } from "@/core/api/cachePolicy";
import { ApiError } from "@/core/api/errors";
import {
  campaignKey,
  clearCampaignCache,
  clearSessionCache,
  createAppQueryClient,
  globalKey,
  meKey,
  shouldRetry,
} from "@/core/api/queryClient";

const apiError = (status: number) => new ApiError({ status, code: "UNKNOWN_ERROR", message: "x" });

describe("query client", () => {
  it("drops only the campaign whose role or membership changed", () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(campaignKey("c1", "locations"), ["Grauhafen"]);
    queryClient.setQueryData(campaignKey("c2", "locations"), ["Morgenhain"]);
    queryClient.setQueryData(globalKey("rulesets"), ["5e 2024"]);

    clearCampaignCache(queryClient, "c1");

    expect(queryClient.getQueryData(campaignKey("c1", "locations"))).toBeUndefined();
    expect(queryClient.getQueryData(campaignKey("c2", "locations"))).toEqual(["Morgenhain"]);
    expect(queryClient.getQueryData(globalKey("rulesets"))).toEqual(["5e 2024"]);
  });

  it("forgets everything when the session ends", () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(meKey("profile"), { displayName: "Lea" });
    queryClient.setQueryData(campaignKey("c1", "notes"), ["Agenda"]);

    clearSessionCache(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("retries server and network failures, not refusals", () => {
    expect(shouldRetry(0, apiError(503))).toBe(true);
    expect(shouldRetry(0, new ApiError({ status: 0, code: "NETWORK_ERROR", message: "x" }))).toBe(true);
    expect(shouldRetry(2, apiError(503))).toBe(false);
    for (const status of [400, 401, 403, 404, 409, 412, 429]) {
      expect(shouldRetry(0, apiError(status))).toBe(false);
    }
  });

  it("keeps signed links until shortly before they expire", () => {
    const now = Date.now();
    const at = (expiresInSeconds: unknown, dataUpdatedAt = now) =>
      signedUrlStaleTime({ state: { data: { expiresInSeconds }, dataUpdatedAt } });

    expect(at(300)).toBeGreaterThan(300_000 - SIGNED_URL_MARGIN_MS - 1000);
    expect(at(300)).toBeLessThanOrEqual(300_000 - SIGNED_URL_MARGIN_MS);
    // Counted from the arrival of the answer, not from the server's clock.
    expect(at(300, now - 290_000)).toBe(0);
    expect(at(10)).toBe(0);
    expect(at("nonsense")).toBe(0);
    expect(signedUrlStaleTime({ state: { data: undefined, dataUpdatedAt: now } })).toBe(0);
    expect(CACHE_POLICY.signedUrl).toMatchObject({ refetchOnWindowFocus: false, refetchOnReconnect: false });
  });

  it("refetches live data", () => {
    expect(CACHE_POLICY.live).toMatchObject({ staleTime: 0, refetchOnReconnect: "always" });
    expect(CACHE_POLICY.static.staleTime).toBeGreaterThan(CACHE_POLICY.content.staleTime);
  });
});
