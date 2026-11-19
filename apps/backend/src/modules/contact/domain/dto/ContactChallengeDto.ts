import { z } from "zod";

/**
 * The signed task of the contact form's JS challenge (ALTCHA v2 proof of work). Parameters keep
 * fields this schema doesn't name, because the signature covers all of them.
 */
const ChallengeParametersSchema = z.looseObject({
  algorithm: z.string().max(32),
  nonce: z.string().max(128),
  salt: z.string().max(128),
  cost: z.number().int().min(1).max(1_000),
  keyLength: z.number().int().min(1).max(64),
  keyPrefix: z.string().max(128),
  keySignature: z.string().max(256).optional(),
  expiresAt: z.number().int().optional(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const ContactChallengeSchema = z.strictObject({
  parameters: ChallengeParametersSchema,
  signature: z.string().max(256),
});

/** What the browser sends back: the task as it got it and the counter it found. */
export const ContactChallengeSolutionSchema = z.strictObject({
  challenge: ContactChallengeSchema,
  solution: z.strictObject({
    counter: z.number().int().min(0),
    derivedKey: z.string().max(256),
    time: z.number().min(0).optional(),
  }),
});

export type ContactChallengeDto = z.infer<typeof ContactChallengeSchema>;
export type ContactChallengeSolutionDto = z.infer<typeof ContactChallengeSolutionSchema>;
