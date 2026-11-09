import { handlePaymentWebhook } from "@/server/market";

/** Payment provider webhook. Signature-verified and idempotent (spec §9.1, §15). */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const result = await handlePaymentWebhook(raw, req.headers.get("x-sandbox-signature"));
    return Response.json(result);
  } catch (e) {
    if (e instanceof Error && /signature/i.test(e.message)) return new Response("invalid signature", { status: 401 });
    throw e;
  }
}
