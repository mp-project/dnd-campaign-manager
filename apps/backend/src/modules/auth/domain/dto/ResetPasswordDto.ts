import { z } from "zod";

export const ResetPasswordSchema = z.strictObject({
  token: z.string().min(24).max(2048),
  newPassword: z.string().min(12).max(200),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
