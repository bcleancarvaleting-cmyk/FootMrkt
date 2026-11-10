import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; paused?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next, paused } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-10">
      <p className="eyebrow">Welcome back</p>
      <h1 className="mb-6 mt-1 text-5xl font-extrabold">Log in</h1>
      {paused && (
        <p className="mb-4 rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-muted">
          {paused === "exclusion" ? "You've self-excluded and been logged out. Take care — free, confidential help is at begambleaware.org or 0808 8020 133." : "Your break has started and you've been logged out. See you when it's over."}
        </p>
      )}
      <div className="panel p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
