import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getProfilesByIds, profileDisplayName } from "@/lib/profiles";
import UserNav from "@/components/UserNav";

export const dynamic = "force-dynamic";

export default async function LibrarySharesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/library-shares");

  const t = await getTranslations("LibraryShares");

  const { data: shares } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("recipient_id", user.id)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false });

  const profiles = await getProfilesByIds((shares ?? []).map((share) => share.owner_id));

  const collections = await Promise.all(
    (shares ?? []).map(async (share) => {
      const ownerName = profileDisplayName(profiles.get(share.owner_id), share.recipient_email);

      const { count } = await supabaseAdmin
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", share.owner_id)
        .eq("is_private", false);

      return { share, ownerName, recipeCount: count ?? 0 };
    })
  );

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-12 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              {t("backToMyRecipes")}
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em]">
              {t("title")}
            </h1>
          </div>
          <UserNav />
        </header>

        {collections.length === 0 ? (
          <p className="text-ink-secondary text-sm">
            {t("emptyState")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map(({ share, ownerName, recipeCount }) => (
              <Link
                key={share.id}
                href={`/library-shares/${share.owner_id}`}
                className="group rounded-xl border border-border-secondary bg-surface-primary p-5 hover:border-border-primary hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-forest-soft shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="w-5 h-5 text-forest"
                    >
                      <path d="M17 20H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2z" />
                    </svg>
                  </div>
                </div>
                <p className="font-medium text-ink-primary text-sm leading-snug break-words">
                  {ownerName}
                </p>
                <p className="text-xs text-ink-tertiary mt-1">
                  {t("recipeCount", { count: recipeCount })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
