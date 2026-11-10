import { syncPacksAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { EconomySections } from "../_parts/economy";
import { OpsSections } from "../_parts/ops";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Packs" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Packs & supply" intro="Card supply, weekly releases and the launch rule for untradeable cards. Switch the pack shop on in Settings.">
        <ActionButton action={syncPacksAction}>Publish new pack versions</ActionButton>
      </AdminTitle>
      <OpsSections only={["supply"]} />
      <EconomySections only={["launch"]} />
    </>
  );
}
