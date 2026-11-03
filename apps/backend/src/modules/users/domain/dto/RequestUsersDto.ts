import { z } from "zod";

import { booleanQueryDto, paginationDto, uuidDto } from "#core/http/dto";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

const RequestUsersListFilterSchema = z.strictObject({
  search: z.string().trim().min(1).max(120).optional(),
  status: UserBaseSchema.shape.status.optional(),
  systemRole: UserBaseSchema.shape.systemRole.optional(),
  includeDisabled: booleanQueryDto.default(true),
});

export const RequestUsersListQuerySchema = RequestUsersListFilterSchema.merge(paginationDto);

export const RequestUserParamsSchema = z.strictObject({
  userId: uuidDto,
});

export type RequestUsersDto = {
  listQuery: z.infer<typeof RequestUsersListQuerySchema>;
  params: z.infer<typeof RequestUserParamsSchema>;
};
