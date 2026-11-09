import Link from "next/link";
import { verifyEmail } from "@/server/auth/accounts";

export const metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  if (token) {
    try {
      await verifyEmail(token);
      ok = true;
    } catch {
      ok = false;
    }
  }
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h1 className="text-2xl font-black">{ok ? "Email verified ✓" : "That link didn't work"}</h1>
      <p className="mt-2 text-muted">{ok ? "Thanks — your account is verified." : "It may have expired or already been used."}</p>
      <Link href="/" className="btn-primary mt-6">
        Continue
      </Link>
    </div>
  );
}
