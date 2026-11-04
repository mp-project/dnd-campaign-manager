import type { AppDatabase } from "#core/db/pool";
import type { Authorization } from "#core/history/authorization";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";

export type MutationOptions = {
  /** Value of the `Idempotency-Key` header; needs `onReplay` in the use case. */
  idempotencyKey?: string;
};

/**
 * Base class of every use case that writes tracked content: one action in one transaction.
 *
 * `execute` is fixed, the module only supplies the rights check and the domain logic. The route
 * permission only checks the system role, so rights on the concrete row belong in `authorize`.
 */
export abstract class MutationUseCase<Input, Output> {
  protected abstract readonly action: string;

  /** False for actions with side effects outside the database, such as an email. */
  protected readonly revertible: boolean = true;

  constructor(protected readonly history: HistoryPort) {}

  /**
   * Runs first in the transaction, also for a repeated request. Only use `db` for queries, because
   * a second pool connection could block the API. Throw to deny.
   */
  protected abstract authorize(
    context: RequestContext,
    input: Input,
    db: AppDatabase,
  ): Promise<Authorization>;

  protected abstract perform(
    scope: ActionScope,
    context: RequestContext,
    input: Input,
  ): Promise<Output>;

  /** Answer for a repeated request. Without it, this use case does not accept idempotency keys. */
  protected onReplay?(context: RequestContext, input: Input, actionId: string): Promise<Output>;

  /** Optional reason shown in the history. */
  protected reasonOf?(input: Input): string | null;

  async execute(
    context: RequestContext,
    input: Input,
    options: MutationOptions = {},
  ): Promise<Output> {
    const { idempotencyKey } = options;

    if (idempotencyKey !== undefined && !this.onReplay) {
      throw new Error(`Action '${this.action}' does not support idempotency keys`);
    }

    return this.history.runAction<Output>(
      {
        action: this.action,
        context,
        reason: this.reasonOf?.(input) ?? null,
        revertible: this.revertible,
        authorize: (db) => this.authorize(context, input, db),
        ...(idempotencyKey !== undefined
          ? {
              idempotency: {
                key: idempotencyKey,
                onReplay: (actionId: string) =>
                  (this.onReplay as NonNullable<typeof this.onReplay>)(context, input, actionId),
              },
            }
          : {}),
      },
      (scope) => this.perform(scope, context, input),
    );
  }
}
