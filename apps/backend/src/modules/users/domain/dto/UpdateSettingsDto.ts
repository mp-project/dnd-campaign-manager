import { z } from "zod";

import { nonEmptyPatch } from "#core/http/dto";
import { UserSettingsBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const UpdateSettingsSchema = nonEmptyPatch(UserSettingsBaseSchema.shape);

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;
