import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "@/server/payments/stripe-signature";

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const sign = (t: number, b = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;

describe("Stripe webhook signatures", () => {
  const now = 1_800_000_000;
  it("accepts a correctly signed, recent event", () => {
    expect(() => verifyStripeSignature(body, sign(now), secret, now)).not.toThrow();
  });
  it("rejects a tampered body", () => {
    expect(() => verifyStripeSignature(body.replace("evt_1", "evt_2"), sign(now), secret, now)).toThrow(/signature/);
  });
  it("rejects an old event (replay)", () => {
    expect(() => verifyStripeSignature(body, sign(now - 600), secret, now)).toThrow(/too old/);
  });
  it("rejects a missing header", () => {
    expect(() => verifyStripeSignature(body, null, secret, now)).toThrow(/signature/);
  });
});
