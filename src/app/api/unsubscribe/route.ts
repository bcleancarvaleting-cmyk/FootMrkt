import { db } from "@/server/db";
import { checkDigestToken } from "@/server/digest";

// One-click unsubscribe from the Friday digest. GET shows a confirm button (link scanners
// prefetch GETs, so they must not unsubscribe anyone); POST unsubscribes — the email's
// List-Unsubscribe-Post header lets mail apps do that in one tap (RFC 8058).
const page = (body: string) =>
  new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MATCHX emails</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060708;color:#f4f5f2;font-family:Helvetica,Arial,sans-serif"><main style="max-width:420px;padding:24px;text-align:center"><p style="font-size:22px;font-weight:800;font-style:italic">MATCH<span style="color:#adfc07">X</span></p>${body}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

const valid = (u: string | null, t: string | null) => !!u && !!t && /^[0-9a-f-]{36}$/.test(u) && checkDigestToken(u, t);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u");
  const t = url.searchParams.get("t");
  if (!valid(u, t)) return page(`<p>This link isn't valid. You can turn emails off in your Profile.</p>`);
  return page(
    `<h1 style="font-size:22px">Stop the Friday digest?</h1><form method="post"><button style="background:#adfc07;color:#0a0d02;border:0;border-radius:12px;padding:13px 22px;font-weight:800;text-transform:uppercase;cursor:pointer">Unsubscribe</button></form><p style="color:#9aa096;font-size:13px">You'll still get emails about your account, payments and prizes.</p>`,
  );
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u");
  const t = url.searchParams.get("t");
  if (!valid(u, t)) return page(`<p>This link isn't valid. You can turn emails off in your Profile.</p>`);
  await db.user.updateMany({ where: { id: u! }, data: { weeklyDigest: false } });
  return page(`<h1 style="font-size:22px">You're unsubscribed</h1><p style="color:#9aa096">No more Friday digests. You can turn it back on in your Profile any time.</p>`);
}
