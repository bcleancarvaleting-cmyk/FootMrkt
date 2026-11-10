import { EconomySections } from "../_parts/economy";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Prize fund" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Prize fund" intro="Admin only. What last week's card revenue suggests for next week's prizes." />
      <EconomySections only={["prize"]} />
    </>
  );
}
