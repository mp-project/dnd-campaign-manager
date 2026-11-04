declare const authorizationBrand: unique symbol;

/**
 * Proof that a write action was checked. It can only come from the functions below, so an empty
 * or forgotten check does not compile. To deny, throw an error such as `ForbiddenError`.
 */
export type Authorization = {
  readonly [authorizationBrand]: true;
  readonly kind: "authorized" | "public";
  readonly reason: string | null;
};

const issued = new WeakSet<object>();

function issue(kind: Authorization["kind"], reason: string | null): Authorization {
  const authorization = { kind, reason } as unknown as Authorization;

  issued.add(authorization);

  return authorization;
}

/** The actor passed all checks of this action. */
export function authorized(): Authorization {
  return issue("authorized", null);
}

/** The action is open on purpose, such as a registration; the reason documents why. */
export function publicAction(reason: string): Authorization {
  if (!reason.trim()) {
    throw new Error("A public action needs a reason");
  }

  return issue("public", reason);
}

export function isAuthorization(value: unknown): value is Authorization {
  return typeof value === "object" && value !== null && issued.has(value);
}
