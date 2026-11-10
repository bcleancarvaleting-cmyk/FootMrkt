import { EconomySections } from "../_parts/economy";
import { OpsSections } from "../_parts/ops";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Community" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Founders & moderators" />
      <EconomySections only={["founders"]} />
      <OpsSections only={["moderators"]} />
    </>
  );
}
