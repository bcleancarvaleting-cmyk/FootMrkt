import Link from "next/link";
import { ProfileForm } from "@/components/account-forms";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">My Account</p>
      <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Profile</h1>
      <p className="mt-2 mb-8 text-sm text-muted">We need your legal name, date of birth and address before you can add funds or withdraw — it&apos;s how we keep MATCHX 18+ and stop fraud. See our <Link href="/legal/privacy" className="text-lime underline">Privacy policy</Link>.</p>
      <ProfileForm
        email={u.email}
        displayName={u.displayName}
        locked={u.kycStatus === "VERIFIED"}
        p={{
          fullName: u.fullName,
          dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null,
          addressLine1: u.addressLine1,
          addressLine2: u.addressLine2,
          city: u.city,
          postcode: u.postcode,
          country: u.country,
          phone: u.phone,
          marketingOptIn: u.marketingOptIn,
        }}
      />
    </div>
  );
}
