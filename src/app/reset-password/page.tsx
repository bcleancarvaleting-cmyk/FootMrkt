import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-10">
      <p className="eyebrow">Reset password</p>
      <h1 className="mb-6 mt-1 text-5xl font-extrabold">New password</h1>
      <div className="panel p-6">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-sm text-muted">
            This link is missing its code. <Link href="/forgot-password" className="text-lime underline">Ask for a new one</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
