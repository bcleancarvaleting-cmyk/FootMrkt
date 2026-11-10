import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { TransfersTabs } from "./tabs";

export default async function TransfersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [auctions, offers] = await Promise.all([
    db.auction.count({ where: { status: "LIVE" } }),
    db.marketOffer.count({ where: { status: "PENDING", listing: { sellerId: user.id } } }),
  ]);
  return (
    <div>
      <TransfersTabs auctions={auctions} offers={offers} />
      {children}
    </div>
  );
}
