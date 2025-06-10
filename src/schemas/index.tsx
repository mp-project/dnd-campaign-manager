import * as z from "zod";

export const LoginSchema = z.object({
  email: z.string().min(1,'Email is required').email(),
  password: z.string().min(1,'Password is required'),
});

export const RegisterSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Password must contain at least one number, one uppercase letter, one lowercase letter'),
})