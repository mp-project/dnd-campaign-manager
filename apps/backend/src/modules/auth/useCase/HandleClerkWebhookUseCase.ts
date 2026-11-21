import { verifyWebhook } from "@clerk/backend/webhooks";

import { ServiceUnavailableError, ValidationError } from "#core/error/http/index";
import type { ResponseClerkWebhookDto } from "#src/modules/auth/domain/dto/ResponseClerkWebhookDto";
import type { AccountService } from "#src/modules/auth/service/AccountService";
import { toExternalUser } from "#src/modules/auth/service/ClerkIdentityPort";

export type ClerkWebhookRequest = {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Keeps the local copy of Clerk accounts in step. Every event is safe to receive twice or out of
 * order: creating and updating both end in the same state, deleting only disables.
 */
export class HandleClerkWebhookUseCase {
  constructor(
    private readonly accountService: AccountService,
    private readonly signingSecret: string | undefined,
  ) {}

  async execute(input: ClerkWebhookRequest): Promise<ResponseClerkWebhookDto> {
    if (!this.signingSecret) {
      throw new ServiceUnavailableError("Clerk webhook is not configured");
    }

    const headers = new Headers();

    for (const [name, value] of Object.entries(input.headers)) {
      if (typeof value === "string") {
        headers.set(name, value);
      }
    }

    let event: Awaited<ReturnType<typeof verifyWebhook>>;

    try {
      event = await verifyWebhook(
        new Request("http://webhook.local/", { method: "POST", headers, body: input.rawBody }),
        { signingSecret: this.signingSecret },
      );
    } catch (error) {
      throw new ValidationError("Invalid webhook signature", { webhook: "signature" }, { cause: error });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await this.accountService.syncUser(toExternalUser(event.data));
        break;
      case "user.deleted":
        if (event.data.id) {
          await this.accountService.markDeleted(event.data.id);
        }
        break;
      case "session.created":
        await this.accountService.recordSignIn(event.data.user_id);
        break;
      default:
        break;
    }

    return { status: "accepted" };
  }
}
