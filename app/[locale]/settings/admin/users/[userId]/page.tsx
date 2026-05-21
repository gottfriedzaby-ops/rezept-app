import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import UserDetailPanel from "@/components/admin/UserDetailPanel";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/settings");

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1100px] mx-auto px-8 py-16">
        <Suspense fallback={<p className="text-sm text-ink-tertiary">Lade…</p>}>
          <UserDetailPanel userId={userId} currentAdminId={user.id} />
        </Suspense>
      </div>
    </div>
  );
}
