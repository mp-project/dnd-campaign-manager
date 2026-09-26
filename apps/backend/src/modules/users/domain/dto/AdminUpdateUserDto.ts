import { z } from "zod";

import {
  UserDisplayNameSchema,
  UserStatusSchema,
  UserSystemRoleSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

const AdminUpdateUserPatchSchema = z
  .strictObject({
    displayName: UserDisplayNameSchema,
    systemRole: UserSystemRoleSchema,
    status: UserStatusSchema,
  })
  .partial()
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.systemRole !== undefined ||
      value.status !== undefined,
    {
      message: "At least one field must be provided for patch updates",
    },
  );

export const AdminUpdateUserSchema = z
  .strictObject({
    expectedVersion: z.coerce.number().int().positive(),
  })
  .and(AdminUpdateUserPatchSchema);

export type AdminUpdateUserDto = z.infer<typeof AdminUpdateUserSchema>;
