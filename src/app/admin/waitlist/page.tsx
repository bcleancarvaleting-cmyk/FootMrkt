import Link from "next/link";
import { setFlagAction } from "@/app/actions/admin";
import { startLaunchEmailsAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { AdminChart } from "@/components/admin-chart";
import { TextSettingForm } from "@/components/admin-forms";
import { fmtDate } from "@/lib/view";
import { APP_URL } from "@/server/email/templates";
import { isEnabled } from "@/server/flags";
import { TEXT_SETTINGS, getText } from "@/server/settings";
import { giftPacks } from "@/server/welcome";
import { waitlistStats } from "@/server/waitlist";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Waitlist" };

export default async function WaitlistAdmin() {
  const [s, on, gift, date, code] = await Promise.all([waitlistStats(), isEnabled("PRELAUNCH"), getText("waitlistRewardSku"), getText("launchDate"), getText("earlyAccessCode")]);
  const pct = (n: number) => (s.total ? `${Math.round((n / s.total) * 100)}%` : "0%");
  const tiles: Array<[string, string, string]> = [
    ["On the list", s.total.toLocaleString("en-GB"), `+${s.today} today · +${s.thisWeek} this week`],
    ["Came via a friend", s.viaFriends.toLocaleString("en-GB"), `${pct(s.viaFriends)} of sign-ups`],
    ["Happy to get news", s.optIn.toLocaleString("en-GB"), "Opted in to marketing"],
    ["Created a club", s.converted.toLocaleString("en-GB"), `${pct(s.converted)} converted · ${s.emailed} launch emails sent`],
  ];
  return (
    <>
      <AdminTitle title="Waitlist" intro="Sign-ups from the pre-launch page: who they are, where they came from, and the launch switch." />

      <section className={`panel flex flex-wrap items-center justify-between gap-4 p-5 ${on ? "border-accent/60" : ""}`}>
        <div className="min-w-0 flex-1 basis-72">
          <p className="eyebrow">{on ? "Pre-launch is ON" : "Pre-launch is off"}</p>
          <p className="mt-1 text-sm text-muted">
            {on
              ? "Logged-out visitors to the homepage see the waitlist page, and sign-up is closed (except with the early-access code). Logged-in managers and Log in work as normal."
              : "The homepage shows the full game and anyone can sign up. The waitlist page is still live at /launch."}
          </p>
          <p className="mt-2 text-sm">
            <Link href="/launch" className="text-lime underline">Preview the waitlist page</Link>
            {code && <span className="text-faint"> · tester sign-up link: <span className="font-mono text-fg">{APP_URL}/register?code={code}</span></span>}
          </p>
        </div>
        <ActionButton action={setFlagAction.bind(null, "PRELAUNCH", !on)} className={on ? "btn-ghost" : "btn-primary"} confirm={on ? "Open MATCHX to everyone? The homepage goes back to the full game and anyone can sign up." : "Switch on Pre-launch? Logged-out visitors will see the waitlist page and sign-up closes."}>
          {on ? "Open the game (launch)" : "Switch on Pre-launch"}
        </ActionButton>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-4">
        {tiles.map(([l, v, sub]) => (
          <div key={l} className="bg-ink-900 p-4">
            <p className="eyebrow">{l}</p>
            <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums">{v}</p>
            <p className="text-xs text-faint">{sub}</p>
          </div>
        ))}
      </section>

      <section className="panel p-5">
        <AdminChart title="Sign-ups per day (last 30 days)" points={s.daily} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Clubs" rows={s.byClub} />
        <Breakdown title="Where they came from (utm_source)" rows={s.bySource} />
        <Breakdown title="Campaigns (utm_campaign)" rows={s.byCampaign} empty="Add ?utm_campaign=… to your ad links to see them here." />
      </section>
      <p className="text-xs text-faint">
        Tag ad links so you can see what works, e.g. <span className="font-mono text-muted">{APP_URL}/?utm_source=instagram&amp;utm_campaign=arsenal-launch&amp;club=ARS</span>. Adding <span className="font-mono">club=ARS</span> greets them as Arsenal fans and pre-picks the club.
      </p>

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl">Launch day</h2>
          <a href="/api/admin/waitlist" className="btn-ghost px-4 py-2 text-xs">Download CSV</a>
        </div>
        <p className="text-sm text-muted">
          When you open MATCHX: switch Pre-launch off above, then email everyone on the list. Each email links to sign-up with their email and club filled in. Signing up with that email gives them the launch gift.
        </p>
        <ActionButton action={startLaunchEmailsAction} className="btn-primary" disabled={s.sending || s.total === 0} confirm={`Email all ${s.total - s.emailed - s.unsub} people on the waitlist that MATCHX is live?`}>
          {s.sending ? "Sending launch emails…" : "Email everyone: we're live"}
        </ActionButton>
        <TextSettingForm settingKey="waitlistRewardSku" label={TEXT_SETTINGS.waitlistRewardSku.label} help={TEXT_SETTINGS.waitlistRewardSku.help} value={gift} options={giftPacks()} />
        <TextSettingForm settingKey="launchDate" label={TEXT_SETTINGS.launchDate.label} help={TEXT_SETTINGS.launchDate.help} value={date} placeholder="2026-12-01 19:00" />
        <TextSettingForm settingKey="earlyAccessCode" label={TEXT_SETTINGS.earlyAccessCode.label} help={TEXT_SETTINGS.earlyAccessCode.help} value={code} placeholder="e.g. FOUNDERS" />
      </section>

      {s.topReferrers.length > 0 && <Breakdown title="Top sharers" rows={s.topReferrers.map((r) => ({ name: r.firstName ? `${r.firstName} · ${r.email}` : r.email, count: r.referrals }))} />}

      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="stack w-full text-sm sm:min-w-[720px]">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["Joined", "Email", "Name", "Club", "Source", "Friends", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {s.recent.map((e) => (
              <tr key={e.id}>
                <td data-label="Joined" className="px-3 py-2 tabular-nums">{fmtDate(e.createdAt)}</td>
                <td data-label="Email" className="px-3 py-2">{e.email}</td>
                <td data-label="Name" className="px-3 py-2">{e.firstName ?? <span className="text-faint">—</span>}</td>
                <td data-label="Club" className="px-3 py-2">{e.clubCode ?? <span className="text-faint">—</span>}</td>
                <td data-label="Source" className="px-3 py-2 text-xs">{[e.utmSource, e.utmCampaign].filter(Boolean).join(" · ") || (e.referredBy ? "friend's link" : e.referrerHost ?? "direct")}</td>
                <td data-label="Friends" className="px-3 py-2 tabular-nums">{e.referrals}</td>
                <td data-label="Status" className="px-3 py-2 text-xs font-bold uppercase">
                  {e.convertedAt ? <span className="text-lime">Joined</span> : e.unsubscribedAt ? <span className="text-faint">Left</span> : e.launchEmailedAt ? <span className="text-warn">Emailed</span> : <span className="text-muted">Waiting</span>}
                </td>
              </tr>
            ))}
            {!s.recent.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-faint">No sign-ups yet. Share {APP_URL}/launch to start.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Breakdown({ title, rows, empty = "Nothing yet." }: { title: string; rows: Array<{ name: string; count: number }>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="panel p-5">
      <h2 className="mb-3 text-xl">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{r.name}</span>
                <b className="tabular-nums">{r.count}</b>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-ink-800">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
