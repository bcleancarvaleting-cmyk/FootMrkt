/** An expected, user-facing failure. Message is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";
