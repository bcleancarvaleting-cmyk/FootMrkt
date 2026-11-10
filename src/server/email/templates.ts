/**
 * Transactional email templates. Plain, mobile-friendly HTML (inline styles, one column) with a
 * text version. Every email links back to MATCHX; none is marketing.
 */
export const APP_URL = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Rendered = { subject: string; html: string; text: string };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(o: { preheader: string; title: string; paragraphs: string[]; cta?: { label: string; href: string }; footnote?: string }): Rendered {
  const html = `<!doctype html><html><body style="margin:0;background:#060708;font-family:Helvetica,Arial,sans-serif;color:#f4f5f2">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060708;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0c0e10;border:1px solid #24282e;border-radius:16px">
<tr><td style="padding:24px 24px 8px;font-size:22px;font-weight:800;font-style:italic;letter-spacing:1px">MATCH<span style="color:#adfc07">X</span></td></tr>
<tr><td style="padding:8px 24px 0;font-size:24px;font-weight:800;line-height:1.2">${esc(o.title)}</td></tr>
${o.paragraphs.map((p) => `<tr><td style="padding:12px 24px 0;font-size:15px;line-height:1.55;color:#c9cdc6">${p}</td></tr>`).join("")}
${o.cta ? `<tr><td style="padding:22px 24px 4px"><a href="${o.cta.href}" style="display:inline-block;background:#adfc07;color:#0a0d02;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:13px 22px;border-radius:12px">${esc(o.cta.label)}</a></td></tr>` : ""}
<tr><td style="padding:22px 24px 24px;font-size:12px;line-height:1.5;color:#6c726a">${o.footnote ? `${esc(o.footnote)}<br>` : ""}You're getting this because you have a MATCHX account. MX is an in-game currency and can't be withdrawn. 18+.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.title, "", ...o.paragraphs.map((p) => p.replace(/<[^>]+>/g, "")), "", o.cta ? `${o.cta.label}: ${o.cta.href}` : "", "", "— MATCHX"].join("\n");
  return { subject: o.title, html, text };
}

const b = (s: string) => `<b style="color:#f4f5f2">${esc(s)}</b>`;

export const EMAILS = {
  welcome: (d: { name: string; verifyUrl?: string }) =>
    layout({
      preheader: "Your 12 free players are waiting.",
      title: `Welcome to MATCHX, ${d.name}`,
      paragraphs: [
        `Your club is ready. Open your free ${b("12-player Starter Pack")}, pick your seven and enter this gameweek's free matches.`,
        `More free packs land over your first four weeks: a Squad Boost on day 3, a Gold on day 6, a Mixed Pack on day 9 and your choice of Gold on day 12.`,
        ...(d.verifyUrl ? [`Please confirm your email address so we can reach you about prizes.`] : []),
      ],
      cta: d.verifyUrl ? { label: "Confirm my email", href: d.verifyUrl } : { label: "Open my Starter Pack", href: `${APP_URL}/packs` },
    }),
  teamSheet: (d: { name: string; match: string; captain?: string | null; deadline: Date; edit: boolean }) =>
    layout({
      preheader: `Your squad for ${d.match} is locked in.`,
      title: d.edit ? "Your team sheet is updated" : "Your team sheet is in",
      paragraphs: [
        `${esc(d.name)}, your squad for ${b(d.match)} is in.${d.captain ? ` Captain: ${b(d.captain)} (double points).` : ""}`,
        `You can change it until ${b(d.deadline.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }))}, 10 minutes before the first kick-off.`,
      ],
      cta: { label: "View my squad", href: `${APP_URL}/matches` },
    }),
  playerSigned: (d: { name: string; player: string; price: string; from: string }) =>
    layout({
      preheader: `${d.player} has joined your club.`,
      title: `You signed ${d.player}`,
      paragraphs: [`${esc(d.name)}, ${b(d.player)} is now in your club, signed from ${esc(d.from)} for ${b(d.price)}.`],
      cta: { label: "See my club", href: `${APP_URL}/account/club` },
    }),
  playerSold: (d: { name: string; player: string; price: string; youGet: string; buyer: string }) =>
    layout({
      preheader: `${d.player} sold for ${d.price}.`,
      title: `${d.player} has been sold`,
      paragraphs: [`${esc(d.name)}, ${esc(d.buyer)} signed ${b(d.player)} for ${b(d.price)}. You received ${b(d.youGet)} of earned MX after the 5% fee.`],
      cta: { label: "My transfers", href: `${APP_URL}/transfers/mine` },
    }),
  offerReceived: (d: { name: string; player: string; amount: string; buyer: string }) =>
    layout({
      preheader: `${d.buyer} offered ${d.amount} for ${d.player}.`,
      title: `New offer for ${d.player}`,
      paragraphs: [`${esc(d.buyer)} has offered ${b(d.amount)} for ${b(d.player)}. Their MX is held, so accepting completes the transfer straight away.`],
      cta: { label: "Review the offer", href: `${APP_URL}/transfers/mine` },
    }),
  offerAccepted: (d: { name: string; player: string; amount: string }) =>
    layout({
      preheader: `${d.player} is yours.`,
      title: "Offer accepted",
      paragraphs: [`Your offer of ${b(d.amount)} for ${b(d.player)} was accepted. They're in your club now.`],
      cta: { label: "See my club", href: `${APP_URL}/account/club` },
    }),
  results: (d: { name: string; match: string; points: number; rank: number; entries: number; xp: number }) =>
    layout({
      preheader: `${d.points} points in ${d.match}.`,
      title: `${d.match}: you finished #${d.rank}`,
      paragraphs: [`${esc(d.name)}, your squad scored ${b(`${d.points} points`)} and finished ${b(`#${d.rank}`)} of ${d.entries}. You earned ${b(`${d.xp} XP`)}.`],
      cta: { label: "See the table", href: `${APP_URL}/matches` },
    }),
  prizeWon: (d: { name: string; match: string; amount: string; rank: string }) =>
    layout({
      preheader: `You won ${d.amount}!`,
      title: `You won ${d.amount}`,
      paragraphs: [`Congratulations ${esc(d.name)} — you finished ${b(d.rank)} in ${b(d.match)} and won ${b(d.amount)}. It's in your winnings balance.`],
      cta: { label: "View my wallet", href: `${APP_URL}/account/wallet` },
      footnote: "Winnings can be withdrawn to a UK bank account in your name (minimum £10) once withdrawals are available.",
    }),
  packReady: (d: { name: string; pack: string }) =>
    layout({
      preheader: `Your ${d.pack} is ready to open.`,
      title: `Your ${d.pack} is ready`,
      paragraphs: [`${esc(d.name)}, a free ${b(d.pack)} has landed in your account.`],
      cta: { label: "Open it", href: `${APP_URL}/packs` },
    }),
  referralReward: (d: { name: string; friend: string; pack: string }) =>
    layout({
      preheader: `${d.friend} joined — here's your reward.`,
      title: "Your friend joined MATCHX",
      paragraphs: [`${b(d.friend)} joined with your link and played their first match, so you've earned a free ${b(d.pack)}. Keep sharing — there's no limit.`],
      cta: { label: "Claim it", href: `${APP_URL}/packs` },
    }),
  withdrawal: (d: { name: string; amount: string; paid: boolean }) =>
    layout({
      preheader: d.paid ? `${d.amount} is on its way.` : "Update on your withdrawal.",
      title: d.paid ? `${d.amount} is on its way` : "We couldn't complete your withdrawal",
      paragraphs: [d.paid ? `Your withdrawal of ${b(d.amount)} has been paid to your bank account.` : `Your withdrawal of ${b(d.amount)} wasn't completed and the money is back in your winnings. Reply to this email if you need help.`],
      cta: { label: "View my wallet", href: `${APP_URL}/account/wallet` },
    }),
} as const;

export type EmailTemplate = keyof typeof EMAILS;
