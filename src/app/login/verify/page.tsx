import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VerifyCodeForm } from "@/components/auth-forms";
import { readPendingLogin } from "@/server/auth/security";

export const metadata = { title: "Two-step login" };

export default async function VerifyLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!readPendingLogin((await cookies()).get("mx_2fa")?.value)) redirect("/login");
  return (
    <div className="mx-auto max-w-sm pt-10">
      <p className="eyebrow">Two-step login</p>
      <h1 className="mb-2 mt-1 text-5xl font-extrabold">Enter your code</h1>
      <p className="mb-6 text-sm text-muted">Open your authenticator app and type the 6-digit code for MATCHX.</p>
      <div className="panel p-6">
        <VerifyCodeForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Can&apos;t get in? <Link href="/support" className="text-lime underline">Contact support</Link>
      </p>
    </div>
  );
}
