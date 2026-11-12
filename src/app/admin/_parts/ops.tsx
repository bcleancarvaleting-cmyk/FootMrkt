import {
  correctionsAction,
  createNextGameweekAction,
  loadGameweeksAheadAction,
  removeAutoMatchesAction,
  deleteGameweekAction,
  finaliseAction,
  lockGameweekAction,
  releaseAction,
  setFlagAction,
  simulateAction,
} from "@/app/actions/admin";
import { revokeModeratorAction } from "@/app/actions/moderation";
import { ActionButton } from "@/components/action-button";
import { InviteModeratorForm } from "@/components/moderator-admin";
import { moderatorRoster } from "@/server/moderation";
import { FLAG_DEFINITIONS, type FlagKey } from "@/config/flags";
import { db } from "@/server/db";
import { allFlags, legalGateCleared } from "@/server/flags";
import { footballSport } from "@/server/gameweeks";
import { supplyReport } from "@/server/supply";
import { fmtDate, hoursAgo } from "@/lib/view";


export async function OpsSections({ only }: { only: string[] }) {
  const show = (k: string) => only.includes(k);
  const sport = await footballSport();
  const day = hoursAgo(24);
  const roster = await moderatorRoster();
  const autoLeft = show("gameweeks") ? (await (await import("@/server/competitions")).autoMatchesStillOpen()).length : 0;
  const [users, newUsers, openings, openings24, listings, flags, supply, gameweeks, releases, auditLog, providerEvents, staleFixtures] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: day } } }),
    db.packOpening.count(),
    db.packOpening.count({ where: { createdAt: { gte: day } } }),
    db.marketListing.count({ where: { status: "ACTIVE" } }),
    allFlags(),
    supplyReport(sport.id),
    db.gameweek.findMany({
      where: { sportId: sport.id },
      orderBy: [{ startsAt: "desc" }],
      take: 8,
      include: { _count: { select: { fixtures: true } }, fixtures: { select: { status: true } }, competitions: { select: { status: true, _count: { select: { entries: true } } } } },
    }),
    db.supplyRelease.findMany({ where: { sportId: sport.id }, orderBy: { scheduledFor: "desc" }, take: 6 }),
    db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { actor: { select: { displayName: true } } } }),
    db.providerEvent.count(),
    db.fixture.count({ where: { status: "SCHEDULED", kickoffAt: { lt: hoursAgo(3) } } }),
  ]);

  return (
    <div className="space-y-8">
      {show("kpis") && (
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Users" value={users} sub={`+${newUsers} today`} />
        <Kpi label="Packs opened" value={openings} sub={`${openings24} today`} />
        <Kpi label="Active listings" value={listings} />
        <Kpi label="Cards issued" value={supply.totalIssued} />
        <Kpi label="Provider events" value={providerEvents} />
        <Kpi label="Overdue fixtures" value={staleFixtures} tone={staleFixtures ? "text-warn" : undefined} />
      </section>
      )}

      {show("gameweeks") && (
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Gameweeks</h2>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              action={loadGameweeksAheadAction}
              className="btn-primary"
              confirm="Load real fixtures for the next 4 weeks? Each week with matches becomes a gameweek (international breaks are skipped). No matches are created — you add and name those yourself."
            >
              Load next 4 weeks of fixtures
            </ActionButton>
            <ActionButton
              action={createNextGameweekAction}
              className="btn-ghost"
              confirm="Add the next gameweek? It loads next week's real fixtures so you can build matches from them. No matches are created — you add those yourself."
            >
              Add one gameweek
            </ActionButton>
          </div>
        </div>
        {autoLeft > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/50 bg-warn/5 px-3 py-2 text-sm">
            <span>
              <b>{autoLeft}</b> automatic match{autoLeft === 1 ? "" : "es"} (Freeroll, Free Draft, Open League, cups) still open from before. Only your own matches should run.
            </span>
            <ActionButton action={removeAutoMatchesAction} className="btn-ghost px-3 py-1.5 text-[11px] text-danger" confirm="Remove every automatic match that hasn't locked yet? Anyone who entered is refunded, their players are freed, and they're told.">
              Remove them
            </ActionButton>
          </div>
        )}
        <p className="mb-3 text-xs text-faint">
          A gameweek just holds that week&apos;s real fixtures — players only see the matches you create and name in it. With live data connected, the next 4 weeks of fixtures are also loaded automatically once a day.
        </p>
        {!flags.SIMULATED_DATA && (
          <p className="mb-3 text-sm text-warn">Simulated data is off and no licensed provider is connected — gameweek tools are unavailable.</p>
        )}
        <div className="space-y-3">
          {gameweeks.map((g) => {
            const played = g.fixtures.filter((f) => f.status !== "SCHEDULED").length;
            const entries = g.competitions.reduce((s, c) => s + c._count.entries, 0);
            return (
              <div key={g.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>
                      {g.simulated ? `SIM ${g.number}` : `GW${g.number}`} · {g.season.replace(/ SIM$/, "")}
                    </b>{" "}
                    {g.simulated && <span className="chip ml-2 border-[#8fe3ff]/60 text-[#8fe3ff]">Simulated</span>}
                    <span className="chip ml-2">{g.status}</span>
                    <div className="text-xs text-faint">{fmtDate(g.startsAt)}</div>
                    <div className="text-xs text-faint">
                      {played}/{g._count.fixtures} fixtures in · {entries} entries · {g.competitions.length} competitions
                    </div>
                  </div>
                  {g.status !== "SETTLED" && (
                    <div className="flex flex-wrap gap-2">
                      {(g.status === "OPEN" || g.status === "UPCOMING") && (
                        <ActionButton action={lockGameweekAction.bind(null, g.id)} confirm="Lock all squads now?">
                          Lock now
                        </ActionButton>
                      )}
                      {g.competitions.length === 0 && played === 0 && (
                        <ActionButton action={deleteGameweekAction.bind(null, g.id)} className="btn-ghost text-danger" confirm={`Delete GW${g.number}? Its fixtures are removed too. Only possible while it has no matches and nothing has been played.`}>
                          Delete
                        </ActionButton>
                      )}
                      <ActionButton action={simulateAction.bind(null, g.id, 3)}>DEV: play 3 fixtures</ActionButton>
                      <ActionButton action={simulateAction.bind(null, g.id, "all")}>DEV: play all</ActionButton>
                      {played > 0 && <ActionButton action={correctionsAction.bind(null, g.id)}>DEV: send corrections</ActionButton>}
                      {played === g._count.fixtures && (
                        <ActionButton action={finaliseAction.bind(null, g.id)} className="btn-primary" confirm="Close the correction window and settle every competition?">
                          Finalise & settle
                        </ActionButton>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {show("supply") && (
        <section className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">
            Card supply{" "}
            <span className={`text-sm ${supply.reconciled ? "text-mint" : "text-danger"}`}>{supply.reconciled ? "✓ reconciled" : "✗ " + supply.problems.join("; ")}</span>
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {(
              [
                ["Total issued", supply.totalIssued],
                ["In pack pool (new)", supply.availableInPool],
                ["In pack pool (recirculated)", supply.recirculatingInPool],
                ["Held by users", supply.userHeld],
                ["…unlocked", supply.heldUnlocked],
                ["…listed", supply.listed],
                ["…in competition", supply.lockedInCompetition],
                ["Non-tradeable", supply.nonTradeable],
                ["Ever recycled", supply.everRecycled],
                ["Retired", supply.retired],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-muted">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mb-2 mt-5 text-sm font-bold">Weekly releases</h3>
          <div className="space-y-2 text-sm">
            {releases.map((r) => {
              const plan = r.plan as { perTemplate: Record<string, number> };
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2">
                  <span>
                    {fmtDate(r.scheduledFor, { dateStyle: "medium" })} <span className="chip ml-1">{r.status}</span>
                    <span className="ml-2 text-xs text-faint">
                      B{plan.perTemplate.BRONZE}/S{plan.perTemplate.SILVER}/G{plan.perTemplate.GOLD} per design
                      {r.status === "EXECUTED" && ` · ${r.cardsMinted} minted`}
                    </span>
                  </span>
                  {r.status === "SCHEDULED" && (
                    <span className="flex gap-1">
                      <ActionButton action={releaseAction.bind(null, r.id, "execute")} className="btn-ghost px-2 py-1 text-xs" confirm="Release this supply now?">
                        Release now
                      </ActionButton>
                      <ActionButton action={releaseAction.bind(null, r.id, "pause")} className="btn-ghost px-2 py-1 text-xs">
                        Pause
                      </ActionButton>
                    </span>
                  )}
                  {r.status === "PAUSED" && (
                    <ActionButton action={releaseAction.bind(null, r.id, "resume")} className="btn-ghost px-2 py-1 text-xs">
                      Resume
                    </ActionButton>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {show("flags") && (
        <section className="panel p-5">
          <h2 id="flags" className="mb-3 text-lg font-bold">Feature flags</h2>
          <div className="space-y-3">
            {(Object.keys(FLAG_DEFINITIONS) as FlagKey[]).map((k) => {
              const def = FLAG_DEFINITIONS[k];
              const gated = def.legalGate && !legalGateCleared(k);
              return (
                <div key={k} className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <div className="font-mono font-semibold">
                      {k} {def.legalGate && <span className="chip ml-1 border-warn/50 text-warn">legal gate</span>}
                    </div>
                    <div className="text-xs text-muted">{def.description}</div>
                  </div>
                  <ActionButton
                    action={setFlagAction.bind(null, k, !flags[k])}
                    className={flags[k] ? "btn-primary px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"}
                    disabled={gated}
                  >
                    {gated ? "Locked" : flags[k] ? "On" : "Off"}
                  </ActionButton>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {show("moderators") && (
      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Chat moderators</h2>
          <a href="/moderation" className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">
            Moderation queue →
          </a>
        </div>
        <p className="mb-3 text-sm text-muted">Admins moderate by default. Anyone else needs an invitation, which they accept from their profile.</p>
        <InviteModeratorForm />
        <ul className="mt-4 divide-y divide-ink-700 text-sm">
          {roster.mods.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span>
                {m.displayName} <span className="chip ml-1">{m.role === "ADMIN" ? "Admin" : "Moderator"}</span>
              </span>
              {m.role === "MODERATOR" && (
                <ActionButton action={revokeModeratorAction.bind(null, m.id)} className="btn-ghost px-3 py-1.5 text-[10px]" confirm="Remove moderator access?">
                  Revoke
                </ActionButton>
              )}
            </li>
          ))}
          {roster.invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2 text-muted">
              <span>
                {i.user.displayName} <span className="chip ml-1">Invited by {i.invitedBy.displayName}</span>
              </span>
              <ActionButton action={revokeModeratorAction.bind(null, i.userId)} className="btn-ghost px-3 py-1.5 text-[10px]">
                Cancel
              </ActionButton>
            </li>
          ))}
        </ul>
      </section>
      )}

      {show("audit") && (
      <section className="panel p-5">
        <h2 className="mb-3 text-lg font-bold">Audit log</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <tbody>
              {auditLog.map((a) => (
                <tr key={a.id} className="table-row">
                  <td className="py-1.5 pr-3 text-xs text-faint">{fmtDate(a.createdAt)}</td>
                  <td className="py-1.5 pr-3">{a.actor?.displayName ?? <span className="text-faint">system</span>}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{a.action}</td>
                  <td className="py-1.5 text-xs text-muted">
                    {a.entityType} {a.entityId?.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className={`text-2xl font-black ${tone ?? ""}`}>{value.toLocaleString("en-GB")}</div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  );
}
