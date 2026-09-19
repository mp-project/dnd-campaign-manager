import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import {
  UserStatusSchema,
  UserSystemRoleSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

const RequestAdminUsersListFilterSchema = z.strictObject({
  search: z.string().trim().min(1).max(120).optional(),
  status: UserStatusSchema.optional(),
  systemRole: UserSystemRoleSchema.optional(),
  includeDisabled: z.coerce.boolean().default(true),
});

export const RequestAdminUsersListQuerySchema =
  RequestAdminUsersListFilterSchema.merge(paginationDto);

export const RequestUserParamsSchema = z.strictObject({
  userId: uuidDto,
});

export type RequestUsersDto = {
  adminListQuery: z.infer<typeof RequestAdminUsersListQuerySchema>;
  params: z.infer<typeof RequestUserParamsSchema>;
};
