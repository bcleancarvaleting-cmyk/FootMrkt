import Link from "next/link";
import { db } from "@/server/db";
import { EMAILS, type EmailTemplate } from "@/server/email/templates";
import { fmtDate } from "@/lib/view";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Emails" };

const SAMPLES: { [K in EmailTemplate]: Parameters<(typeof EMAILS)[K]>[0] } = {
  welcome: { name: "DemoManager", verifyUrl: "https://playmatchx.com/verify?token=example" },
  teamSheet: { name: "DemoManager", match: "Freeroll · GW4", captain: "E. Haaland", deadline: new Date(), edit: false },
  playerSigned: { name: "DemoManager", player: "Cole Palmer", price: "12.99 MX", from: "MATCHX" },
  playerSold: { name: "DemoManager", player: "Cole Palmer", price: "12.99 MX", youGet: "12.34 MX", buyer: "GoldenBoot22" },
  offerReceived: { name: "DemoManager", player: "Cole Palmer", amount: "11.00 MX", buyer: "GoldenBoot22" },
  offerAccepted: { name: "DemoManager", player: "Cole Palmer", amount: "11.00 MX" },
  results: { name: "DemoManager", match: "Open League · GW4", points: 42, rank: 3, entries: 120, xp: 42 },
  prizeWon: { name: "DemoManager", match: "Freeroll · GW4", amount: "£10.00", rank: "#1" },
  packReady: { name: "DemoManager", pack: "Squad Boost" },
  referralReward: { name: "DemoManager", friend: "PackHunter", pack: "Choice of Bronze" },
  withdrawal: { name: "DemoManager", amount: "£12.50", paid: true },
  passwordReset: { name: "DemoManager", url: "https://playmatchx.com/reset-password?token=example" },
  supportReceived: { name: "DemoManager", ref: "A1B2C3" },
  test: { name: "DemoManager" },
  waitlistJoined: { name: "Sam", position: 128, total: 2410, shareUrl: "https://playmatchx.com/launch?ref=ab12cd3", gift: "Choice of Gold", perFriend: 10, unsubscribeUrl: "https://playmatchx.com/api/unsubscribe?w=example" },
  launchLive: { name: "Sam", url: "https://playmatchx.com/register?email=sam%40example.com", gift: "Choice of Gold", unsubscribeUrl: "https://playmatchx.com/api/unsubscribe?w=example" },
  weeklyDigest: { name: "DemoManager", players: [{ name: "E. Haaland", vs: "MCI v ARS", when: "Sat 17:30" }, { name: "C. Palmer", vs: "CHE v LIV", when: "Sun 14:00" }], playing: 6, value: 84.5, changePct: 3.2, deadline: "Sat 11:00", openMatches: 4, entered: 1, drops: 5, unsubscribeUrl: "https://playmatchx.com/api/unsubscribe?u=example" },
  errorAlert: { name: "DemoManager", title: "Server error", message: "Something went wrong", path: "/packs", source: "SERVER" },
};

export default async function EmailsAdmin({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const [logs, counts] = await Promise.all([
    db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.emailLog.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const provider = !!process.env.RESEND_API_KEY;
  const tpl = (preview && preview in EMAILS ? preview : "welcome") as EmailTemplate;
  const rendered = (EMAILS[tpl] as (d: unknown) => { subject: string; html: string })(SAMPLES[tpl]);
  return (
    <>
      <AdminTitle
        title="Emails"
        intro={
          provider
            ? "Transactional emails are sent through Resend. Every email is logged here first."
            : "No email provider connected yet: emails are logged here but not sent. Add a Resend API key (RESEND_API_KEY) and sender (EMAIL_FROM) to start sending."
        }
      />
      <section className="flex flex-wrap gap-2 text-sm">
        {counts.map((c) => (
          <span key={c.status} className="chip">
            {c.status.toLowerCase()} <b className="text-fg">{c._count._all}</b>
          </span>
        ))}
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Templates</h2>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(EMAILS) as EmailTemplate[]).map((k) => (
            <Link key={k} href={`/admin/emails?preview=${k}`} className={`chip ${k === tpl ? "border-accent text-fg" : ""}`}>
              {k}
            </Link>
          ))}
        </div>
        <p className="text-sm">
          Subject: <b>{rendered.subject}</b>
        </p>
        <iframe title={`Preview: ${tpl}`} srcDoc={rendered.html} className="h-[520px] w-full rounded-xl border border-ink-700 bg-[#060708]" sandbox="" />
      </section>
      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="stack w-full text-sm sm:min-w-[640px]">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["When", "To", "Email", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {logs.map((l) => (
              <tr key={l.id}>
                <td data-label="When" className="px-3 py-2 tabular-nums">{fmtDate(l.createdAt)}</td>
                <td data-label="To" className="px-3 py-2">{l.to}</td>
                <td data-label="Email" className="px-3 py-2">{l.subject}</td>
                <td data-label="Status" className={`px-3 py-2 text-xs font-bold uppercase ${l.status === "SENT" ? "text-lime" : l.status === "FAILED" ? "text-danger" : "text-faint"}`} title={l.error ?? undefined}>
                  {l.status.toLowerCase()}
                </td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-faint">No emails yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
