import { z } from "zod";

import { uuidDto } from "#core/http/dto";

export const DeleteRulesetSchema = z.strictObject({
  rulesetId: uuidDto,
});

export type DeleteRulesetDto = z.infer<typeof DeleteRulesetSchema>;
