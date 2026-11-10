import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { TransfersTabs } from "./tabs";

export default async function TransfersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [auctionsOn, auctions, offers] = await Promise.all([
    isEnabled("AUCTIONS"),
    db.auction.count({ where: { status: "LIVE" } }),
    db.marketOffer.count({ where: { status: "PENDING", listing: { sellerId: user.id } } }),
  ]);
  return (
    <div>
      <TransfersTabs auctions={auctionsOn ? auctions : 0} soon={!auctionsOn} offers={offers} />
      {children}
    </div>
  );
}
