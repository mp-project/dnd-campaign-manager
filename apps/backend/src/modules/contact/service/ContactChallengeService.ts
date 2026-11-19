import { randomBytes } from "node:crypto";

import { CappedMap, type Challenge, createChallenge, randomInt, type Solution, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/sha";

import type { ContactChallengeDto, ContactChallengeSolutionDto } from "#src/modules/contact/domain/dto/ContactChallengeDto";

/** How long a task stays valid, and how long it must be at least before a message counts. */
const CHALLENGE_TTL_SECONDS = 10 * 60;
export const CONTACT_CHALLENGE_MIN_AGE_SECONDS = 3;
/**
 * Range of the secret counter: the browser tries counters from 0 until it hits it, which takes
 * well under a second to a few seconds on a phone. Verification costs one HMAC.
 */
const COUNTER_MIN = 5_000;
const COUNTER_MAX = 40_000;
/** Solved tasks this process remembers so none counts twice (more than the rate limit allows). */
const USED_CAPACITY = 10_000;

export type ContactChallengeCheck = "ok" | "invalid" | "expired" | "tooFast" | "used";

/**
 * The contact form's JS challenge, no captcha: the server hands out a signed proof-of-work task
 * (ALTCHA v2, SHA-256, `altcha-lib`), the browser solves it in the background while the visitor
 * types, and the message carries the solution. It checks signature, solution and expiry, refuses
 * a task younger than `CONTACT_CHALLENGE_MIN_AGE_SECONDS` (nobody fills the form that fast) and
 * one that was used already. Without `secret` (`CONTACT_CHALLENGE_SECRET`) a random one per
 * process applies, so several API instances need the setting.
 */
export class ContactChallengeService {
  private readonly signatureSecret: string;
  private readonly keySignatureSecret: string;
  private readonly used = new CappedMap<string, number>({ maxSize: USED_CAPACITY });

  constructor(
    secret: string | undefined,
    private readonly now: () => number = () => Date.now(),
  ) {
    const base = secret ?? randomBytes(32).toString("hex");
    this.signatureSecret = `${base}:challenge`;
    this.keySignatureSecret = `${base}:key`;
  }

  async issue(): Promise<ContactChallengeDto> {
    const nowSeconds = Math.floor(this.now() / 1000);
    const challenge = await createChallenge({
      algorithm: "SHA-256",
      cost: 1,
      counter: randomInt(COUNTER_MAX, COUNTER_MIN),
      deriveKey,
      expiresAt: nowSeconds + CHALLENGE_TTL_SECONDS,
      data: { issuedAt: nowSeconds },
      hmacSignatureSecret: this.signatureSecret,
      hmacKeySignatureSecret: this.keySignatureSecret,
    });

    return {
      parameters: challenge.parameters as ContactChallengeDto["parameters"],
      signature: challenge.signature ?? "",
    };
  }

  async check(payload: ContactChallengeSolutionDto): Promise<ContactChallengeCheck> {
    // Checked by the request schema; the library types optional fields without `undefined`.
    const result = await verifySolution({
      challenge: payload.challenge as Challenge,
      solution: payload.solution as Solution,
      deriveKey,
      hmacSignatureSecret: this.signatureSecret,
      hmacKeySignatureSecret: this.keySignatureSecret,
    });
    if (result.expired) return "expired";
    if (!result.verified) return "invalid";

    // Signed with the task, so it can be trusted once the signature holds.
    const issuedAt = Number(payload.challenge.parameters.data?.issuedAt);
    if (!Number.isFinite(issuedAt)) return "invalid";
    if (this.now() / 1000 - issuedAt < CONTACT_CHALLENGE_MIN_AGE_SECONDS) return "tooFast";

    this.forgetExpired();
    const expiresAt = payload.challenge.parameters.expiresAt ?? issuedAt + CHALLENGE_TTL_SECONDS;
    return this.used.setIfAbsent(payload.challenge.signature, expiresAt) ? "ok" : "used";
  }

  private forgetExpired(): void {
    const nowSeconds = this.now() / 1000;
    for (const [signature, expiresAt] of this.used) {
      if ((expiresAt as number) < nowSeconds) this.used.delete(signature);
    }
  }
}
