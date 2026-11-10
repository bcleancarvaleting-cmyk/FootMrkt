import { EconomySections } from "../_parts/economy";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Gifts" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Gifts & free packs" intro="Gift drops for everyone who logs in during a window (Christmas, cup finals, milestones), and the welcome gifts every new manager gets." />
      <EconomySections only={["drops", "welcome"]} />
    </>
  );
}
