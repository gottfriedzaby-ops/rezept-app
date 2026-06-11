import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getProfilesByIds } from "@/lib/profiles";
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

  const t = await getTranslations("LibraryShares");

  const { data: shares } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("recipient_id", user.id)
    .in("status", ["pending", "accepted"])
    .order("invited_at", { ascending: false });

  const profiles = await getProfilesByIds((shares ?? []).map((share) => share.owner_id));

  const enriched: LibraryShareInbound[] = (shares ?? []).map((share) => {
    const owner = profiles.get(share.owner_id);
    return {
      ...share,
      owner_display_name: owner?.display_name ?? null,
      owner_email: owner?.email ?? share.recipient_email,
    };
  });

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div>
            <Link
              href="/library-shares"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              {t("backToShares")}
            </Link>
            <h1 className="font-serif text-3xl font-medium text-ink-primary tracking-[-0.02em]">
              {t("invitationsTitle")}
            </h1>
          </div>
          <UserNav />
        </header>
        <IncomingSharesManager initialShares={enriched} />
      </div>
    </div>
  );
}
