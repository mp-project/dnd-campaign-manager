import { api, type ApiData, unwrap } from "@/core/api/client";

export type Ruleset = ApiData<"listRulesets">["data"][number];

export function createCampaign(body: { name: string; rulesetId: string; description?: string }) {
  return unwrap(api.POST("/api/v1/campaigns", { body }));
}

/** The rulesets a new campaign can use (active ones). */
export function listRulesets() {
  return unwrap(api.GET("/api/v1/ruleset", { params: { query: { status: "ACTIVE" } } }));
}
