import { z } from "zod";

import { nonEmptyPatch } from "#core/http/dto";
import {
  UserLocaleSchema,
  UserThemeSchema,
  UserTimezoneSchema,
  UserUiPreferencesSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const UpdateSettingsSchema = nonEmptyPatch({
  locale: UserLocaleSchema,
  timezone: UserTimezoneSchema,
  theme: UserThemeSchema,
  reducedMotion: z.boolean(),
  uiPreferences: UserUiPreferencesSchema,
});

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;
