import { requireAdmin } from "@/server/auth/session";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
      <AdminNav />
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
