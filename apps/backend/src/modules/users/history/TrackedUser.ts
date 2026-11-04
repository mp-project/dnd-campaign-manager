import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { users } from "#src/modules/users/domain/entities/UsersTable";

export const USER_ENTITY_TYPE = "user";

export const USER_ACTIONS = {
  update: "user.update",
  disable: "user.disable",
} as const;

/**
 * History rules of a user. It only covers what administrators change, so it shows who granted or
 * took away which rights. The own profile and everything in the auth module are written directly,
 * so entries can have gaps in their versions. Administrators pass every check in the history
 * anyway, so everybody else is denied here. Nothing can be undone: rights must not come back that
 * way, and the other fields keep no value.
 */
export const trackedUser = defineTrackedEntity({
  type: USER_ENTITY_TYPE,
  table: users,
  access: {
    read: () => false,
  },
  fields: {
    systemRole: field.value({ revertible: false }),
    status: field.value({ revertible: false }),
    displayName: field.account(),
    email: field.account(),
    username: field.account(),
    passwordHash: field.secret(),
    googleSubject: field.ignore(),
    discordUserId: field.ignore(),
    userTag: field.ignore(),
    emailVerifiedAt: field.ignore(),
    lastLoginAt: field.ignore(),
  },
});
