import Link from "next/link";
import { maxPriceFor } from "@/server/transfers";
import { WatchButton } from "@/components/watch-button";
import { isWatching } from "@/server/watchlist";
import { STAMPS, type StampKind, stampsForCard } from "@/server/stamps";
import { FINISH_STYLE, FinishPill } from "@/components/finish-art";
import { discardLoanAction } from "@/app/actions/account";
import { notFound } from "next/navigation";
import { toggleFavouriteAction, toggleShowcaseAction } from "@/app/actions/game";
import { cancelListingAction, cancelMyAuctionAction } from "@/app/actions/transfers";
import { ActionButton } from "@/components/action-button";
import { AuctionListForm, ListingForm } from "@/components/listing-form";
import { listingGuidance } from "@/server/transfers-view";
import { PlayerCard } from "@/components/player-card";
import { ValueChart } from "@/components/value-chart";
import { enrichCards } from "@/server/views";
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
  // In a manager auction: the card is locked to it until it ends.
  const auction = card.lock === "LISTED" && !listing && card.lockRef ? await db.auction.findFirst({ where: { id: card.lockRef, status: "LIVE" }, include: { _count: { select: { bids: true } } } }) : null;
  const stamps = await stampsForCard(id);
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
          ? card.template.edition === "STANDARD"
            ? "Owned · untradeable (issued before paid packs launched)"
            : "Owned · free card, untradeable"
          : "Owned · available";

  return (
    <div className="grid gap-8 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <PlayerCard card={view} size="lg" />
        {isOwner && view.loan?.ended && view.lock === "NONE" && (
          <ActionButton action={discardLoanAction.bind(null, id)} className="btn-primary bg-danger text-white" confirm={`Discard ${view.name}? Their loan has ended and they go back to their club.`}>
            Discard loan player
          </ActionButton>
        )}
        {user && <WatchButton playerId={card.template.playerId} initial={await isWatching(user.id, card.template.playerId)} />}
        {isOwner && user && (
          <ActionButton action={toggleShowcaseAction.bind(null, id)} className="btn-ghost text-xs">
            {(await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { showcaseCardIds: true } })).showcaseCardIds.includes(id) ? "📌 Pinned to club page" : "📌 Pin to club page"}
          </ActionButton>
        )}
        {isOwner && (
          <ActionButton action={toggleFavouriteAction.bind(null, id)} className="btn-ghost text-xs">
            {favourite ? "★ Favourited" : "☆ Favourite"}
          </ActionButton>
        )}
      </div>

      <div className="space-y-6">
        <div>
          <p className="eyebrow">
            {card.template.category} · {view.finish ? `${FINISH_STYLE[view.finish.kind].label} ${view.finish.serial} of ${view.finish.of}` : card.template.edition === "STARTER" ? "Starter edition" : card.template.edition === "LOAN" ? "Loan player" : "Standard edition"}
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
          {view.loan ? (
            <Info label="On loan">
              <span className={`text-2xl font-black ${view.loan.ended ? "text-danger" : "text-lime"}`}>
                {view.loan.ended ? "Loan ended" : `${view.loan.left} of ${view.loan.total} uses`}
              </span>
              <span className="block text-xs text-faint">Free · untradeable · no value</span>
            </Info>
          ) : (
            <Info label="Indicative value">
              <span className="text-2xl font-black text-lime">{latest ? `${latest.valueMp} MX` : "—"}</span>
            </Info>
          )}
          <Info label={isOwner ? "You got it" : "Status"}>
            {isOwner && view.acquired ? <span className="text-lg font-bold">{view.acquired}</span> : null}
            <span className="block text-xs text-faint">{status}</span>
          </Info>
          <Info label="Card ID">
            <span className="break-all font-mono text-[11px] text-muted">{card.id}</span>
            <span className="block text-xs text-faint">
              Serial #{card.serial}
              {view.issued !== null && card.template.maxSupply ? ` · ${view.issued.toLocaleString("en-GB")} issued of ${card.template.maxSupply.toLocaleString("en-GB")}` : ""}
            </span>
            {view.finish && (
              <span className="mt-2 block">
                <FinishPill finish={view.finish} id="cardpage" />
                <span className="mt-1 block text-xs text-faint">{view.finish.kind === "RAINBOW" ? "The only one in the world. Looks only: it plays as a normal card." : `Only ${FINISH_STYLE[view.finish.kind].word} exist. Looks only: it plays as the Gold.`}</span>
              </span>
            )}
          </Info>
        </div>

        {view.loan ? (
          <p className="text-sm text-muted">
            Loan players play for your squad in the first {view.loan.total} gameweeks you enter. When the last of those gameweeks has finished, the card flashes and you can
            discard them — they go back to their club.
          </p>
        ) : (
          <>
        <p className="text-xs text-faint">
          MX is an indicative valuation based on supply, recent form, league and eligible completed sales. It is not cash, cannot be
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
                  <span>{((s.soldPriceMinor ?? 0) / 100).toFixed(2)} MX</span>
                </div>
              ))}
            </div>
          )}
        </section>
          </>
        )}

        <section className="panel p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Card history</h2>
            <span className="text-xs text-faint">{stamps.length ? `${stamps.length} stamp${stamps.length === 1 ? "" : "s"}` : ""}</span>
          </div>
          {stamps.length ? (
            <ul className="space-y-2">
              {stamps.map((st) => (
                <li key={st.id} className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2">
                  <span className="mt-0.5 w-9 shrink-0 text-center text-sm" aria-hidden="true">
                    {STAMPS[st.kind as StampKind]?.icon ?? "★"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gold">{st.label}</span>
                    <span className="block text-xs text-muted">{st.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">
              No stamps yet. When this player scores a hat-trick, keeps a clean sheet, or wins a match while in your squad, it&apos;s stamped on this card for good.
            </p>
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
                  Listed at <b>{(listing.askingPriceMinor / 100).toFixed(2)} MX</b> until {fmtDate(listing.expiresAt)}
                </span>
                <ActionButton action={cancelListingAction.bind(null, listing.id, id)} className="btn-danger">
                  Cancel listing
                </ActionButton>
              </div>
            ) : auction ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  In auction until <b>{fmtDate(auction.endsAt)}</b> · {auction._count.bids} bid{auction._count.bids === 1 ? "" : "s"}
                  {auction.buyNowMinor ? ` · buy it now ${(auction.buyNowMinor / 100).toFixed(2)} MX` : ""}
                </span>
                {auction._count.bids === 0 && (
                  <ActionButton action={cancelMyAuctionAction.bind(null, auction.id, id)} className="btn-danger">
                    Cancel auction
                  </ActionButton>
                )}
              </div>
            ) : card.lock === "NONE" ? (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-muted">Buy now</h3>
                  <ListingForm
                    cardId={id}
                    guidance={await listingGuidance(view)}
                    enabled={flags.MARKET}
                    maxMinor={maxPriceFor(view.finish?.kind)}
                    finishLabel={view.finish ? FINISH_STYLE[view.finish.kind].label : null}
                  />
                </div>
                <div className="border-t border-ink-700 pt-5">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-muted">…or auction it</h3>
                  <AuctionListForm cardId={id} enabled={flags.MARKET && flags.AUCTIONS} maxMinor={maxPriceFor(view.finish?.kind)} suggestedMinor={(await listingGuidance(view)).recommendedMinor} />
                </div>
              </div>
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
