import { z } from "zod";

export const ChangePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
