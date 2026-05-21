import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/settings");

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1100px] mx-auto px-8 py-16">
        <a
          href="/settings"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Einstellungen
        </a>

        <Suspense fallback={<p className="text-sm text-ink-tertiary">Lade…</p>}>
          <AdminDashboard />
        </Suspense>
      </div>
    </div>
  );
}
