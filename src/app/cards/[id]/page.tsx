import Link from "next/link";
import { notFound } from "next/navigation";
import { toggleFavouriteAction } from "@/app/actions/game";
import { cancelListingAction } from "@/app/actions/transfers";
import { ActionButton } from "@/components/action-button";
import { ListingForm } from "@/components/listing-form";
import { listingGuidance } from "@/server/transfers-view";
import { PlayerCard } from "@/components/player-card";
import { ValueChart } from "@/components/value-chart";
import { enrichCards } from "@/server/views";
import { indicativeMoney } from "@/domain/valuation/mp";
import { getCurrentUser } from "@/server/auth/session";
import { cardDetail } from "@/server/binder";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { allFlags } from "@/server/flags";
import { POSITION_LABEL, fmtDate } from "@/lib/view";

export const metadata = { title: "Card" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await getCurrentUser();
  const { card, valuations, sales, isOwner } = await cardDetail(id, user?.id ?? null).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const flags = await allFlags();
  const latest = valuations.at(-1) ?? null;
  const [view] = await enrichCards([card]);
  const favourite = user ? !!(await db.favouriteCard.findUnique({ where: { userId_cardId: { userId: user.id, cardId: id } } })) : false;
  const listing = card.listings[0];
  const pointsHistory =
    isOwner && user
      ? await db.cardPoints.findMany({
          where: { cardId: id, userId: user.id },
          include: { entry: { include: { competition: true } } },
          orderBy: { settledAt: "desc" },
          take: 20,
        })
      : [];
  const signals = (latest?.signals ?? {}) as Record<string, unknown>;
  const competition =
    card.lock === "COMPETITION" && card.lockRef
      ? await db.competitionEntry.findUnique({ where: { id: card.lockRef }, include: { competition: true } })
      : null;

  const status = !card.ownerId
    ? "Not owned"
    : card.lock === "LISTED"
      ? "Listed on Transfers"
      : card.lock === "COMPETITION"
        ? "Locked in a competition squad"
        : card.tradeStatus === "NON_TRADEABLE"
          ? "Owned · untradeable"
          : "Owned · available";

  return (
    <div className="grid gap-8 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <PlayerCard card={view} size="lg" />
        {isOwner && (
          <ActionButton action={toggleFavouriteAction.bind(null, id)} className="btn-ghost text-xs">
            {favourite ? "★ Favourited" : "☆ Favourite"}
          </ActionButton>
        )}
      </div>

      <div className="space-y-6">
        <div>
          <p className="eyebrow">
            {card.template.category} · {card.template.edition === "STARTER" ? "Starter edition" : "Standard edition"}
          </p>
          <h1 className="text-5xl font-extrabold">
            <Link href={`/players/${card.template.playerId}`} className="hover:text-lime">
              {card.template.player.firstName} {card.template.player.lastName}
            </Link>
          </h1>
          <p className="text-muted">
            {POSITION_LABEL[view.position]} · {card.template.player.club?.name ?? "Free agent"} · {card.template.player.club?.league.name}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Info label="Indicative value">
            <span className="text-2xl font-black text-lime">{latest ? `${latest.valueMp} MP` : "—"}</span>
            {latest && <span className="block text-xs text-faint">≈ {indicativeMoney(latest.valueMp)} indicative</span>}
          </Info>
          <Info label={isOwner ? "You got it" : "Status"}>
            {isOwner && view.acquired ? <span className="text-lg font-bold">{view.acquired}</span> : null}
            <span className="block text-xs text-faint">{status}</span>
          </Info>
          <Info label="Card ID">
            <span className="break-all font-mono text-[11px] text-muted">{card.id}</span>
            <span className="block text-xs text-faint">
              Serial #{card.serial}
              {card.template.maxSupply ? ` of max ${card.template.maxSupply}` : ""}
            </span>
          </Info>
        </div>

        <p className="text-xs text-faint">
          MP is an indicative valuation based on supply, recent form, league and eligible completed sales. It is not cash, cannot be
          withdrawn, and is not a promise that this card can be sold for that amount.
        </p>

        <section className="panel p-5">
          <h2 className="mb-3 font-bold">Value history</h2>
          <ValueChart points={valuations.map((v) => ({ at: v.computedAt, mp: v.valueMp }))} />
          {latest && (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer text-faint hover:text-fg">How this value was calculated ({String(signals.method)})</summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {Object.entries(signals).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-faint">{k}</dt>
                    <dd>{v === null ? "—" : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {sales.length > 0 && (
            <div className="mt-4 text-sm">
              <h3 className="mb-1 text-xs uppercase tracking-wider text-faint">Recent completed sales (this player &amp; tier)</h3>
              {sales.map((s, i) => (
                <div key={i} className="flex justify-between text-muted">
                  <span>{s.soldAt ? fmtDate(s.soldAt) : ""}</span>
                  <span>{((s.soldPriceMinor ?? 0) / 100).toFixed(2)} MP</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {isOwner && (
          <section className="panel p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold">Points won for you</h2>
              <span className="text-2xl font-black text-lime">{view.pointsForYou ?? 0}</span>
            </div>
            {pointsHistory.length ? (
              <ul className="space-y-1 text-sm">
                {pointsHistory.map((p) => (
                  <li key={p.id} className="flex justify-between gap-4">
                    <Link href={`/competitions/${p.entry.competitionId}`} className="text-muted hover:text-fg">
                      {p.entry.competition.name}
                    </Link>
                    <b>{p.points} pts</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">Pick this card in a squad — its points will build up here after each settled gameweek.</p>
            )}
          </section>
        )}

        {competition && (
          <p className="text-sm text-muted">
            Selected in{" "}
            <Link className="text-lime hover:underline" href={`/competitions/${competition.competitionId}`}>
              {competition.competition.name}
            </Link>{" "}
            — it unlocks when the competition settles.
          </p>
        )}

        {isOwner && card.tradeStatus === "TRADEABLE" && (
          <section id="sell" className="panel p-5">
            <h2 className="mb-3 text-2xl">Sell on Transfers</h2>
            {!flags.MARKET && <p className="mb-3 text-sm text-warn">Trading opens once our UK legal and payment checks are complete.</p>}
            {listing ? (
              <div className="flex items-center justify-between">
                <span>
                  Listed at <b>{(listing.askingPriceMinor / 100).toFixed(2)} MP</b> until {fmtDate(listing.expiresAt)}
                </span>
                <ActionButton action={cancelListingAction.bind(null, listing.id, id)} className="btn-danger">
                  Cancel listing
                </ActionButton>
              </div>
            ) : card.lock === "NONE" ? (
              <ListingForm cardId={id} guidance={await listingGuidance(view)} enabled={flags.MARKET} />
            ) : (
              <p className="text-sm text-muted">This card is busy and can&apos;t be listed right now.</p>
            )}
          </section>
        )}

        <section className="panel p-5">
          <h2 className="mb-3 font-bold">Ownership history</h2>
          <ol className="space-y-2 text-sm">
            {card.ownerships.map((o) => (
              <li key={o.id} className="flex justify-between gap-4">
                <span>
                  {o.user.displayName}{" "}
                  <span className="text-faint">· {o.acquiredVia.replace("_", " ").toLowerCase()}</span>
                </span>
                <span className="text-faint">
                  {fmtDate(o.acquiredAt, { dateStyle: "medium" })}
                  {o.releasedAt ? ` → ${fmtDate(o.releasedAt, { dateStyle: "medium" })}` : " → now"}
                </span>
              </li>
            ))}
            {!card.ownerships.length && <li className="text-faint">Never owned — in circulation.</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
