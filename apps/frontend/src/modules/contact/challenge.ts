import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/sha";

import { api, unwrap } from "@/core/api/client";
import type { operations } from "@/core/api/generated/schema";

import type { ContactMessage } from "./api";

export type ContactChallenge = operations["issueContactChallenge"]["responses"][200]["content"]["application/json"];
export type ContactChallengeSolution = ContactMessage["challenge"];

/**
 * The backend refuses a task younger than 3 s (nobody fills the form that fast); a little more,
 * so a visitor who sends at once never meets that check.
 */
export const CHALLENGE_MIN_AGE_MS = 3_500;

export class ContactChallengeError extends Error {
  constructor() {
    super("Contact challenge could not be solved");
    this.name = "ContactChallengeError";
  }
}

/**
 * The contact form's JS challenge, no captcha: fetches a signed task (`GET /contact/challenge`),
 * solves it with `altcha-lib` (SHA-256 proof of work through Web Crypto, under a second to a few
 * seconds) and resolves once the task is old enough to count. Each message needs its own.
 */
export async function solveContactChallenge(wait: (ms: number) => Promise<void> = delay): Promise<ContactChallengeSolution> {
  const fetchedAt = Date.now();
  const challenge = await unwrap(api.GET("/api/v1/contact/challenge"));
  const solution = await solveChallenge({ challenge: challenge as Parameters<typeof solveChallenge>[0]["challenge"], deriveKey });
  if (!solution) throw new ContactChallengeError();

  const left = CHALLENGE_MIN_AGE_MS - (Date.now() - fetchedAt);
  if (left > 0) await wait(left);
  return { challenge, solution };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
