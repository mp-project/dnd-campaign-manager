import { queryOptions } from "@tanstack/vue-query";

import { cachePolicy } from "@/core/api/cachePolicy";
import { globalKey } from "@/core/api/queryClient";

import { listRulesets } from "./api";

/** Rulesets change rarely; the name of a campaign's ruleset comes from here too. */
export const rulesetsQuery = queryOptions({
  queryKey: globalKey("rulesets", "active"),
  queryFn: listRulesets,
  ...cachePolicy("static"),
});
