import { EconomySections } from "../_parts/economy";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Transfers" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Transfers & auctions" intro="MATCHX buy-now listings from circulation, and house auctions." />
      <EconomySections only={["house", "auctions"]} />
    </>
  );
}
