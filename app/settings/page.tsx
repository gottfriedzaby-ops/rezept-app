import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import ShareManager from "@/components/ShareManager";
import UserSettingsActions from "@/components/UserSettingsActions";
import LibraryShareManager from "@/components/LibraryShareManager";
import IncomingSharesManager from "@/components/IncomingSharesManager";
import TagMergeToggle from "@/components/TagMergeToggle";
import type { LibraryShareOutbound, LibraryShareInbound, ReshareRequest } from "@/types/library-sharing";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    { data: shares },
    { data: librarySharesRaw },
    { data: incomingSharesRaw },
    { data: userSettings },
  ] = await Promise.all([
    supabaseAdmin
      .from("shares")
      .select("id, created_at, token, label, revoked_at")
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("library_shares")
      .select("*")
      .eq("owner_id", user.id)
      .neq("status", "revoked")
      .order("invited_at", { ascending: false }),
    supabaseAdmin
      .from("library_shares")
      .select("*")
      .eq("recipient_id", user.id)
      .in("status", ["pending", "accepted"])
      .order("invited_at", { ascending: false }),
    supabaseAdmin
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const libraryShares: LibraryShareOutbound[] = await Promise.all(
    (librarySharesRaw ?? []).map(async (share) => {
      let recipient_display_name: string | null = null;
      if (share.recipient_id) {
        const { data } = await supabaseAdmin.auth.admin.getUserById(share.recipient_id);
        if (data.user) {
          recipient_display_name =
            (data.user.user_metadata?.full_name as string) || null;
        }
      }
      return { ...share, recipient_display_name };
    })
  );

  const incomingShares: LibraryShareInbound[] = await Promise.all(
    (incomingSharesRaw ?? []).map(async (share) => {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
      const owner_email = ownerData.user?.email ?? share.recipient_email;
      const owner_display_name =
        (ownerData.user?.user_metadata?.full_name as string) || null;
      return { ...share, owner_display_name, owner_email };
    })
  );

  const ownedShareIds = libraryShares.map((s) => s.id);
  const { data: reshareRequestsRaw } = ownedShareIds.length
    ? await supabaseAdmin
        .from("library_share_reshare_requests")
        .select("*")
        .in("parent_share_id", ownedShareIds)
        .eq("status", "pending_owner_consent")
        .order("created_at", { ascending: false })
    : { data: [] };

  const mergeTagsDefault = userSettings?.merge_shared_tags_into_global ?? true;

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-16">
        <a
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Alle Rezepte
        </a>

        <h1 className="font-serif text-4xl font-medium text-ink-primary tracking-[-0.02em] mb-10">
          Einstellungen
        </h1>

        {/* Account info */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Konto
          </h2>
          <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
            <p className="text-sm text-ink-secondary">
              Angemeldet als <span className="text-ink-primary font-medium">{user.email}</span>
            </p>
            <UserSettingsActions />
          </div>
        </section>

        {/* Library sharing — outbound */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Bibliothek teilen
          </h2>
          <LibraryShareManager
            initialShares={libraryShares}
            reshareRequests={(reshareRequestsRaw ?? []) as ReshareRequest[]}
          />
        </section>

        {/* Library sharing — inbound */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Geteilte Sammlungen (Eingehend)
          </h2>
          <IncomingSharesManager initialShares={incomingShares} />
        </section>

        {/* Tag settings */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Tag-Einstellungen
          </h2>
          <TagMergeToggle initialValue={mergeTagsDefault} />
        </section>

        {/* Share links */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Geteilte Links
          </h2>
          <ShareManager initialShares={shares ?? []} />
        </section>
      </div>
    </div>
  );
}
