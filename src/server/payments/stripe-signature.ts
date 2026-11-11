import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_S = 300;

/** Verify a Stripe-Signature header ("t=…,v1=…") against the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowS = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = (header ?? "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) throw new Error("Invalid webhook signature");
  if (Math.abs(nowS - t) > TOLERANCE_S) throw new Error("Invalid webhook signature (too old)");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error("Invalid webhook signature");
}
