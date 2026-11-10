import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPassword() {
  return (
    <div className="mx-auto max-w-sm pt-10">
      <p className="eyebrow">Locked out?</p>
      <h1 className="mb-2 mt-1 text-5xl font-extrabold">Reset password</h1>
      <p className="mb-6 text-sm text-muted">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
      <div className="panel p-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Remembered it? <Link href="/login" className="text-lime underline">Log in</Link>
      </p>
    </div>
  );
}
