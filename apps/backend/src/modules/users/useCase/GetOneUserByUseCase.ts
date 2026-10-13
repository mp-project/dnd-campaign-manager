import { z } from "zod";

import { RequestEmailVerificationSchema } from "#src/modules/users/domain/dto/RequestEmailVerificationDto";
import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { UsersService } from "#src/modules/users/service/UsersService";

const GetOneUserBySchema = z.union([
  RequestUserParamsSchema.pick({ userId: true }),
  RequestEmailVerificationSchema.pick({ email: true }),
]);

export type GetOneUserByDto = z.input<typeof GetOneUserBySchema>;

export class GetOneUserByUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(input: GetOneUserByDto) {
    const query = GetOneUserBySchema.parse(input);

    return this.usersService.getOneBy(query);
  }
}
