import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import AppVersionSection from "@/components/AppVersionSection";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import ShareManager from "@/components/ShareManager";
import UserSettingsActions from "@/components/UserSettingsActions";
import LibraryShareManager from "@/components/LibraryShareManager";
import IncomingSharesManager from "@/components/IncomingSharesManager";
import NotificationsToggle from "@/components/NotificationsToggle";
import TagMergeToggle from "@/components/TagMergeToggle";
import AnalyticsToggle from "@/components/AnalyticsToggle";
import InvitedEmailsManager, {
  type InvitedEmail,
} from "@/components/admin/InvitedEmailsManager";
import { isAdmin } from "@/lib/admin";
import { isInviteOnlyEnabled } from "@/lib/invited-emails";
import { getProfilesByIds } from "@/lib/profiles";
import type { LibraryShareOutbound, LibraryShareInbound, ReshareRequest } from "@/types/library-sharing";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const t = await getTranslations('Settings');

  const userIsAdmin = isAdmin(user);
  const inviteOnly = isInviteOnlyEnabled();

  const { data: invitedEmailsRaw } = userIsAdmin
    ? await supabaseAdmin
        .from("invited_emails")
        .select("email, invited_at, registered_at")
        .order("invited_at", { ascending: false })
    : { data: [] as InvitedEmail[] };

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

  const profileIds = [
    ...(librarySharesRaw ?? [])
      .map((share) => share.recipient_id)
      .filter((id): id is string => Boolean(id)),
    ...(incomingSharesRaw ?? []).map((share) => share.owner_id),
  ];
  const profiles = await getProfilesByIds(profileIds);

  const libraryShares: LibraryShareOutbound[] = (librarySharesRaw ?? []).map((share) => ({
    ...share,
    recipient_display_name: share.recipient_id
      ? profiles.get(share.recipient_id)?.display_name ?? null
      : null,
  }));

  const incomingShares: LibraryShareInbound[] = (incomingSharesRaw ?? []).map((share) => {
    const owner = profiles.get(share.owner_id);
    return {
      ...share,
      owner_display_name: owner?.display_name ?? null,
      owner_email: owner?.email ?? share.recipient_email,
    };
  });

  const ownedShareIds = libraryShares.map((s) => s.id);
  const { data: reshareRequestsRaw } = ownedShareIds.length
    ? await supabaseAdmin
        .from("library_share_reshare_requests")
        .select("*")
        .in("parent_share_id", ownedShareIds)
        .eq("status", "pending_owner_consent")
        .order("created_at", { ascending: false })
    : { data: [] };

  const showSharedDefault = userSettings?.show_shared_in_main_library ?? true;
  const analyticsEnabledDefault = userSettings?.analytics_enabled ?? true;

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-16">
        <a
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← {t('backLink')}
        </a>

        <h1 className="font-serif text-4xl font-medium text-ink-primary tracking-[-0.02em] mb-10">
          {t('title')}
        </h1>

        {/* Account info */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('account')}
          </h2>
          <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
            <p className="text-sm text-ink-secondary">
              {t('loggedInAs', { email: user.email ?? "" })}
            </p>
            <UserSettingsActions />
          </div>
        </section>

        {/* Language */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('language')}
          </h2>
          <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
            <LanguageSwitcher />
          </div>
        </section>

        {/* Appearance */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('appearance')}
          </h2>
          <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
            <ThemeToggle />
          </div>
        </section>

        {/* About / version */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('about')}
          </h2>
          <AppVersionSection />
        </section>

        {/* Library sharing — outbound */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('shareLibrary')}
          </h2>
          <LibraryShareManager
            initialShares={libraryShares}
            reshareRequests={(reshareRequestsRaw ?? []) as ReshareRequest[]}
          />
        </section>

        {/* Library sharing — inbound */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('incomingShares')}
          </h2>
          <IncomingSharesManager initialShares={incomingShares} />
        </section>

        {/* Library display settings */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('libraryView')}
          </h2>
          <TagMergeToggle initialValue={showSharedDefault} />
        </section>

        {/* Notifications */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('notifications')}
          </h2>
          <NotificationsToggle />
        </section>

        {/* Privacy / analytics consent */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('privacy')}
          </h2>
          <AnalyticsToggle initialValue={analyticsEnabledDefault} />
        </section>

        {/* Share links */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            {t('shareLinks')}
          </h2>
          <ShareManager initialShares={shares ?? []} />
        </section>

        {/* Admin — only rendered when the current user's email is in ADMIN_EMAILS */}
        {userIsAdmin && (
          <>
            <section className="mb-10">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
                {t('adminDashboard')}
              </h2>
              <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
                <p className="text-sm text-ink-secondary mb-3">
                  {t('adminDashboardDesc')}
                </p>
                <a
                  href="/settings/admin"
                  className="inline-flex items-center gap-1 text-sm font-medium text-forest hover:text-forest-deep transition-colors"
                >
                  {t('adminDashboardLink')}
                </a>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
                {t('adminEmails')}
              </h2>
              <InvitedEmailsManager
                initialInvites={(invitedEmailsRaw ?? []) as InvitedEmail[]}
                inviteOnlyEnabled={inviteOnly}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
