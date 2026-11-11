import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { TransferTicker } from "@/components/transfer-ticker";
import { TransfersTabs } from "./tabs";

export default async function TransfersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [drops, offers, auctions] = await Promise.all([
    db.marketListing.count({ where: { house: true, status: "ACTIVE", liveAt: { lte: new Date() }, card: { packable: false } } }),
    db.marketOffer.count({ where: { status: "PENDING", listing: { sellerId: user.id } } }),
    db.auction.count({ where: { status: "LIVE" } }),
  ]);
  return (
    <div>
      <TransfersTabs drops={drops} offers={offers} auctions={auctions} />
      <TransferTicker />
      {children}
    </div>
  );
}
