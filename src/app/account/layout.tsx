import { requireUser } from "@/server/auth/session";
import { AccountTabs } from "./tabs";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div>
      <AccountTabs />
      {children}
    </div>
  );
}
