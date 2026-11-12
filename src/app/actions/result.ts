import { ZodError } from "zod";
import { DomainError } from "@/server/errors";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; issues?: Array<{ message: string; cardId?: string; code?: string }> };

/** Turn expected failures into a user-safe result; let unexpected errors surface. */
export async function attempt<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code, issues: Array.isArray(e.details) ? (e.details as never) : undefined };
    }
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(" · ") };
    // Next.js redirects/not-found are thrown as errors and must propagate.
    throw e;
  }
}
