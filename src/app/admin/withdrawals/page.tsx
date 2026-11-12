import { EconomySections } from "../_parts/economy";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Withdrawals" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Withdrawals" intro="Only £ winnings can be withdrawn, never spend-only credit." />
      <EconomySections only={["withdrawals"]} />
    </>
  );
}
