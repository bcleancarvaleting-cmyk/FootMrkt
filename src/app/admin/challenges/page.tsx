import { clubBindersAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { EconomySections } from "../_parts/economy";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Challenges" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Challenges & binders" intro="Hand-in challenges for MX and packs, and a 5-player binder for every club.">
        <ActionButton action={clubBindersAction}>Create missing club binders</ActionButton>
      </AdminTitle>
      <EconomySections only={["challenges"]} />
    </>
  );
}
