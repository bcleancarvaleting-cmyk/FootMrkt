/**
 * Transactional email templates. Plain, mobile-friendly HTML (inline styles, one column) with a
 * text version. Every email links back to MATCHX; none is marketing.
 */
// The site's public address, for links in emails and payment pages. Set APP_URL (e.g.
// https://playmatchx.com) once the domain points at the host; until then the host's own address.
export const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");

type Rendered = { subject: string; html: string; text: string };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(o: { preheader: string; title: string; paragraphs: string[]; cta?: { label: string; href: string }; footnote?: string; unsubscribe?: string }): Rendered {
  const html = `<!doctype html><html><body style="margin:0;background:#060708;font-family:Helvetica,Arial,sans-serif;color:#f4f5f2">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060708;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0c0e10;border:1px solid #24282e;border-radius:16px">
<tr><td style="padding:24px 24px 8px;font-size:22px;font-weight:800;font-style:italic;letter-spacing:1px">MATCH<span style="color:#adfc07">X</span></td></tr>
<tr><td style="padding:8px 24px 0;font-size:24px;font-weight:800;line-height:1.2">${esc(o.title)}</td></tr>
${o.paragraphs.map((p) => `<tr><td style="padding:12px 24px 0;font-size:15px;line-height:1.55;color:#c9cdc6">${p}</td></tr>`).join("")}
${o.cta ? `<tr><td style="padding:22px 24px 4px"><a href="${o.cta.href}" style="display:inline-block;background:#adfc07;color:#0a0d02;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:13px 22px;border-radius:12px">${esc(o.cta.label)}</a></td></tr>` : ""}
<tr><td style="padding:22px 24px 24px;font-size:12px;line-height:1.5;color:#6c726a">${o.footnote ? `${esc(o.footnote)}<br>` : ""}You're getting this because you have a MATCHX account. MX is an in-game currency and can't be withdrawn. 18+.${o.unsubscribe ? `<br><a href="${o.unsubscribe}" style="color:#9aa096">Unsubscribe from this email</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.title, "", ...o.paragraphs.map((p) => p.replace(/<[^>]+>/g, "")), "", o.cta ? `${o.cta.label}: ${o.cta.href}` : "", "", "— MATCHX", o.unsubscribe ? `Unsubscribe: ${o.unsubscribe}` : ""].join("\n");
  return { subject: o.title, html, text };
}

const b = (s: string) => `<b style="color:#f4f5f2">${esc(s)}</b>`;

export const EMAILS = {
  welcome: (d: { name: string; verifyUrl?: string }) =>
    layout({
      preheader: "Your 14 free players are waiting.",
      title: `Welcome to MATCHX, ${d.name}`,
      paragraphs: [
        `Your club is ready. Open your ${b("four free league Starter Packs")} — a full squad for the Premier League, Championship, League One and League Two — make your three league picks and choose your two Premier League Gold loans.`,
        `Then a free booster pack lands every Tuesday: put it on one player to boost their points.`,
        ...(d.verifyUrl ? [`Please confirm your email address so we can reach you about prizes.`] : []),
      ],
      cta: d.verifyUrl ? { label: "Confirm my email", href: d.verifyUrl } : { label: "Open my Starter Packs", href: `${APP_URL}/packs` },
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
  passwordReset: (d: { name: string; url: string }) =>
    layout({
      preheader: "Reset your MATCHX password.",
      title: "Reset your password",
      paragraphs: [`Someone (hopefully you) asked to reset the password for ${b(d.name)}. The link works for one hour and can only be used once.`, `If it wasn't you, ignore this email — your password hasn't changed.`],
      cta: { label: "Choose a new password", href: d.url },
    }),
  supportReceived: (d: { name: string; ref: string }) =>
    layout({
      preheader: "We've got your message.",
      title: "We've got your message",
      paragraphs: [`Thanks ${esc(d.name)} — your message (ref ${b(d.ref)}) is with the MATCHX team. We'll reply to this email address, usually within a day.`],
    }),
  errorAlert: (d: { name: string; title: string; message: string; path: string; source: string }) =>
    layout({
      preheader: `${d.source === "BROWSER" ? "A player's browser" : "The server"} hit an error.`,
      title: `🚨 ${esc(d.title)}`,
      paragraphs: [`${b(d.source === "BROWSER" ? "In a player's browser" : "On the server")} · page ${esc(d.path)}`, esc(d.message), "You'll only be emailed again if it comes back after you mark it fixed."],
      cta: { label: "Open Admin → Errors", href: `${APP_URL}/admin/errors` },
    }),
  weeklyDigest: (d: {
    name: string;
    players: { name: string; vs: string; when: string }[];
    playing: number;
    value: number;
    changePct: number | null;
    deadline: string | null;
    openMatches: number;
    entered: number;
    drops: number;
    unsubscribeUrl: string;
  }) =>
    layout({
      preheader: d.playing ? `${d.playing} of your players are in action this weekend.` : "Your MATCHX weekend.",
      title: d.playing ? `${d.playing} of your players play this weekend` : "Your MATCHX weekend",
      paragraphs: [
        `Hi ${esc(d.name)} — here's your weekend.`,
        ...(d.players.length
          ? [d.players.map((p) => `${b(p.name)} <span style="color:#9aa096">${esc(p.vs)} · ${esc(p.when)}</span>`).join("<br>") + (d.playing > d.players.length ? `<br><span style="color:#9aa096">+${d.playing - d.players.length} more</span>` : "")]
          : []),
        `Club value: ${b(`${d.value.toFixed(2)} MX`)}${d.changePct !== null ? ` <span style="color:${d.changePct > 0 ? "#5ee6a8" : d.changePct < 0 ? "#ff6b6b" : "#9aa096"}">${d.changePct > 0 ? "▲" : d.changePct < 0 ? "▼" : "–"} ${Math.abs(d.changePct)}%</span>` : ""}`,
        ...(d.deadline
          ? [d.entered ? `You're in ${b(`${d.entered} of ${d.openMatches}`)} open matches. Deadline ${b(d.deadline)}.` : `${b(`${d.openMatches} matches`)} are open — the Freeroll is free. Deadline ${b(d.deadline)}.`]
          : []),
        ...(d.drops ? [`${b(`${d.drops} player drop${d.drops === 1 ? "" : "s"}`)} on the Transfer list today.`] : []),
      ],
      cta: d.deadline && d.entered < d.openMatches ? { label: "Pick my seven", href: `${APP_URL}/matches` } : { label: "Open MATCHX", href: `${APP_URL}/account/club` },
      footnote: "Sent on Fridays. Turn it off in Profile or with the link below.",
      unsubscribe: d.unsubscribeUrl,
    }),
  waitlistJoined: (d: { name: string; position: number; total: number; shareUrl: string; gift: string; perFriend: number; unsubscribeUrl: string }) =>
    layout({
      preheader: `You're #${d.position} on the MATCHX list.`,
      title: `You're on the list — #${d.position.toLocaleString("en-GB")}`,
      paragraphs: [
        `Hi ${esc(d.name)} — you're in. We'll email you the moment MATCHX kicks off, and you'll get ${b(d.gift)} free when you create your club with this email.`,
        `Want to move up? Every friend who joins with your link moves you up ${b(`${d.perFriend} places`)}:`,
        `<a href="${d.shareUrl}" style="color:#adfc07;word-break:break-all">${esc(d.shareUrl)}</a>`,
        `${d.total.toLocaleString("en-GB")} managers are waiting for kick-off.`,
      ],
      cta: { label: "Share my link", href: d.shareUrl },
      footnote: "You asked to be told when MATCHX launches.",
      unsubscribe: d.unsubscribeUrl,
    }),
  launchLive: (d: { name: string; url: string; gift: string; unsubscribeUrl: string }) =>
    layout({
      preheader: "MATCHX is open. Your free players are waiting.",
      title: "MATCHX is live ⚽",
      paragraphs: [
        `Hi ${esc(d.name)} — the wait is over. Create your club now and open your 49 free players: a full squad for the Premier League, Championship, League One and League Two.`,
        `Because you joined the waitlist, you also get ${b(d.gift)} — it's waiting in Packs when you sign up with this email.`,
      ],
      cta: { label: "Create my club", href: d.url },
      footnote: "You joined the MATCHX waitlist.",
      unsubscribe: d.unsubscribeUrl,
    }),
  test: (d: { name: string }) =>
    layout({
      preheader: "Your MATCHX emails are working.",
      title: "Emails are working ✓",
      paragraphs: [`Hi ${esc(d.name)} — this is a test from Admin → Integrations. Welcome, password reset, team-sheet, results and prize emails will now reach your managers.`],
    }),
} as const;

export type EmailTemplate = keyof typeof EMAILS;
