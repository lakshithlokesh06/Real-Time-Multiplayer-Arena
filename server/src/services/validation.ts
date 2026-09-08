import { z } from "zod";
import { HttpError } from "../utils/http-error.js";
const email = z.string().trim().toLowerCase().max(254).email();
const password = z.string().min(15, "Use at least 15 characters for your password.").max(128, "Use at most 128 characters for your password.");
const displayName = z.string().trim().min(1).max(40).refine(value => !/[\p{Cc}\p{Cf}<>]/u.test(value), "Use a display name without control characters or angle brackets.");
export const registerSchema = z.strictObject({ email, password, username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "Username must be 3–20 letters, numbers, or underscores."), displayName });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const profileSchema = z.strictObject({ displayName });
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
 const result = schema.safeParse(input);
 if (!result.success) {
  const messages: Record<string, string> = {
   email: "Enter a valid email address.",
   username: "Username must be 3–20 letters, numbers, or underscores.",
   displayName: "Display name must be 1–40 characters, without control characters or angle brackets.",
   password: Object.is(schema, loginSchema) ? "Enter a password of at most 128 characters." : "Use a password of 15–128 characters.",
  };
  const field = result.error.issues[0]?.path[0];
  throw new HttpError(400, typeof field === "string" ? messages[field] ?? "Check the submitted fields." : "Submit only the required fields in a JSON object.");
 }
 return result.data;
}
