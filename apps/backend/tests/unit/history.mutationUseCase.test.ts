import { authorized, isAuthorization, publicAction } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionMeta, ActionScope, HistoryPort } from "#core/history/types";
import type { AppDatabase } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";

const CONTEXT: RequestContext = {
  actorId: "11111111-1111-4111-8111-111111111111",
  systemRole: "USER",
};
const TX = {} as AppDatabase;
const SCOPE = { actionId: "action" } as ActionScope;

function buildPort() {
  const calls: string[] = [];
  const metas: ActionMeta<unknown>[] = [];
  const port = {
    runAction: async (meta: ActionMeta<unknown>, work: (scope: ActionScope) => Promise<unknown>) => {
      metas.push(meta);
      calls.push("runAction");
      await meta.authorize(TX);
      calls.push("authorized");

      return work(SCOPE);
    },
  } as unknown as HistoryPort;

  return { port, calls, metas };
}

class SampleUseCase extends MutationUseCase<{ deny?: boolean }, string> {
  protected readonly action = "sample.update";

  constructor(
    port: HistoryPort,
    private readonly log: string[],
  ) {
    super(port);
  }

  protected async authorize(_context: RequestContext, input: { deny?: boolean }) {
    this.log.push("authorize");

    if (input.deny) {
      throw new Error("denied");
    }

    return authorized();
  }

  protected async perform() {
    this.log.push("perform");

    return "done";
  }

  protected override reasonOf() {
    return "because";
  }
}

// These classes only exist for the compiler; `tsc` fails if the rule stops being enforced.
// @ts-expect-error A use case without `authorize` must not compile.
class WithoutAuthorize extends MutationUseCase<object, string> {
  protected readonly action = "sample.none";

  protected async perform() {
    return "done";
  }
}

class WithEmptyAuthorize extends MutationUseCase<object, string> {
  protected readonly action = "sample.empty";

  // @ts-expect-error An empty check must not compile, because it returns no Authorization.
  protected async authorize() {}

  protected async perform() {
    return "done";
  }
}

class WithForgedAuthorization extends MutationUseCase<object, string> {
  protected readonly action = "sample.forged";

  // @ts-expect-error A hand-written object is no Authorization.
  protected async authorize() {
    return { kind: "authorized", reason: null };
  }

  protected async perform() {
    return "done";
  }
}

describe("MutationUseCase", () => {
  it("keeps the compile-time examples referenced", () => {
    expect([WithoutAuthorize, WithEmptyAuthorize, WithForgedAuthorization]).toHaveLength(3);
  });

  it("checks rights before the domain logic", async () => {
    const { port } = buildPort();
    const log: string[] = [];

    await expect(new SampleUseCase(port, log).execute(CONTEXT, {})).resolves.toBe("done");
    expect(log).toEqual(["authorize", "perform"]);
  });

  it("does not run the domain logic when denied", async () => {
    const { port } = buildPort();
    const log: string[] = [];

    await expect(new SampleUseCase(port, log).execute(CONTEXT, { deny: true })).rejects.toThrow(
      "denied",
    );
    expect(log).toEqual(["authorize"]);
  });

  it("passes action, context and reason on", async () => {
    const { port, metas } = buildPort();

    await new SampleUseCase(port, []).execute(CONTEXT, {});

    expect(metas[0]).toMatchObject({
      action: "sample.update",
      context: CONTEXT,
      reason: "because",
      revertible: true,
    });
    expect(metas[0]?.idempotency).toBeUndefined();
  });

  it("refuses an idempotency key without a replay answer", async () => {
    const { port, calls } = buildPort();

    await expect(
      new SampleUseCase(port, []).execute(CONTEXT, {}, { idempotencyKey: "key" }),
    ).rejects.toThrow(/does not support idempotency keys/);
    expect(calls).toEqual([]);
  });
});

describe("authorization proof", () => {
  it("recognizes only issued proofs", () => {
    expect(isAuthorization(authorized())).toBe(true);
    expect(isAuthorization(publicAction("Registration is open"))).toBe(true);
    expect(isAuthorization({ kind: "authorized", reason: null })).toBe(false);
    expect(isAuthorization(undefined)).toBe(false);
  });

  it("needs a reason for public actions", () => {
    expect(publicAction("Registration is open")).toMatchObject({
      kind: "public",
      reason: "Registration is open",
    });
    expect(() => publicAction("  ")).toThrow(/needs a reason/);
  });
});
