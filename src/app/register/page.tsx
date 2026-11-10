import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="mx-auto grid max-w-4xl gap-10 pt-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="eyebrow">One account · every world</p>
        <h1 className="text-4xl font-black leading-tight">
          Your club starts with <span className="text-lime">11 free players.</span>
        </h1>
        <p className="text-muted">
          Every new manager gets a free Starter Pack: a goalkeeper, two defenders, two midfielders, two attackers and four
          substitutes — enough to enter this week&apos;s competition straight away.
        </p>
        <ul className="space-y-2 text-sm text-muted">
          <li>✓ Mainly Bronze and Silver, plus a top-flight player</li>
          <li>✓ Score points from real match performances</li>
          <li>✓ Starter cards are yours to play with but can&apos;t be sold or traded</li>
        </ul>
      </div>
      <div className="panel p-6">
        <RegisterForm referrer={ref?.slice(0, 24)} />
      </div>
    </div>
  );
}
