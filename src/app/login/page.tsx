import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-10">
      <p className="eyebrow">Welcome back</p>
      <h1 className="mb-6 mt-1 text-5xl font-extrabold">Log in</h1>
      <div className="panel p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
