import { db } from "@/server/db";
import { handlePaymentWebhook } from "@/server/market";
import { loadPayments } from "@/server/payments/config";
import { signatureHeader } from "@/server/payments/provider";

/** Payment provider webhook. Signature-verified and idempotent (spec §9.1, §15). */
export async function POST(req: Request) {
  const raw = await req.text();
  await loadPayments();
  const header = signatureHeader();
  try {
    const result = await handlePaymentWebhook(raw, req.headers.get(header));
    await note("payments.lastWebhook", { ok: true, at: new Date().toISOString(), result: result.status });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Kept for Admin → Integrations, so a wrong signing secret or URL is easy to spot.
    await note("payments.lastWebhook", { ok: false, at: new Date().toISOString(), error: message.slice(0, 300), hadSignature: !!req.headers.get(header), header });
    if (/signature/i.test(message)) return new Response("invalid signature", { status: 401 });
    throw e;
  }
}

async function note(key: string, value: Record<string, unknown>) {
  await db.appSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } }).catch(() => {});
}
