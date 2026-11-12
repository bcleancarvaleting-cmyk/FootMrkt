import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { TickerMode } from "@/components/scores-ticker";
import { TransfersTabs } from "./tabs";

export default async function TransfersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [drops, offers, auctions, basket] = await Promise.all([
    db.marketListing.count({ where: { house: true, status: "ACTIVE", liveAt: { lte: new Date() }, card: { packable: false } } }),
    db.marketOffer.count({ where: { status: "PENDING", listing: { sellerId: user.id } } }),
    db.auction.count({ where: { status: "LIVE" } }),
    db.basketItem.count({ where: { userId: user.id } }),
  ]);
  return (
    <div>
      <TransfersTabs drops={drops} offers={offers} auctions={auctions} basket={basket} />
      <TickerMode mode="transfers" />
      {children}
    </div>
  );
}
