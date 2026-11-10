import { EconomySections } from "../_parts/economy";
import { OpsSections } from "../_parts/ops";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Matches" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Matches & gameweeks" intro="Open, lock and settle gameweeks, and set each match's entry, rules and £ prizes." />
      <OpsSections only={["gameweeks"]} />
      <EconomySections only={["matchrules"]} />
    </>
  );
}
