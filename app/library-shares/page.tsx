import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import UserNav from "@/components/UserNav";

export const dynamic = "force-dynamic";

export default async function LibrarySharesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/library-shares");

  const { data: shares } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("recipient_id", user.id)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false });

  const collections = await Promise.all(
    (shares ?? []).map(async (share) => {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
      const ownerName =
        (ownerData.user?.user_metadata?.full_name as string) ||
        ownerData.user?.email ||
        share.recipient_email;

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
              ← Meine Rezepte
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em]">
              Geteilte Sammlungen
            </h1>
          </div>
          <UserNav />
        </header>

        {collections.length === 0 ? (
          <p className="text-ink-secondary text-sm">
            Du hast noch keine geteilten Sammlungen. Sobald jemand seine Bibliothek mit dir teilt
            und du die Einladung angenommen hast, erscheint sie hier.
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
                  {recipeCount} {recipeCount === 1 ? "Rezept" : "Rezepte"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
