export type SystemRole = "ADMIN" | "USER";

export type RequestContext = {
  actorId: string | null;
  systemRole: SystemRole;
};
