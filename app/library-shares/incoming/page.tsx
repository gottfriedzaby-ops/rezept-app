import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import IncomingSharesManager from "@/components/IncomingSharesManager";
import UserNav from "@/components/UserNav";
import type { LibraryShareInbound } from "@/types/library-sharing";

export const dynamic = "force-dynamic";

export default async function IncomingSharesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/library-shares/incoming");

  const { data: shares } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("recipient_id", user.id)
    .in("status", ["pending", "accepted"])
    .order("invited_at", { ascending: false });

  const enriched: LibraryShareInbound[] = await Promise.all(
    (shares ?? []).map(async (share) => {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
      const owner_email = ownerData.user?.email ?? share.recipient_email;
      const owner_display_name =
        (ownerData.user?.user_metadata?.full_name as string) || null;
      return { ...share, owner_display_name, owner_email };
    })
  );

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div>
            <Link
              href="/library-shares"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              ← Geteilte Sammlungen
            </Link>
            <h1 className="font-serif text-3xl font-medium text-ink-primary tracking-[-0.02em]">
              Einladungen
            </h1>
          </div>
          <UserNav />
        </header>
        <IncomingSharesManager initialShares={enriched} />
      </div>
    </div>
  );
}
