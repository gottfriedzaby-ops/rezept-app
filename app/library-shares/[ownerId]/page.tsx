import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import RecipeList from "@/components/RecipeList";
import UserNav from "@/components/UserNav";
import type { Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";

export default async function SharedLibraryPage({
  params,
}: {
  params: { ownerId: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/library-shares/${params.ownerId}`);

  // Verify an accepted share exists
  const { data: share } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("owner_id", params.ownerId)
    .eq("recipient_id", user.id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!share) notFound();

  const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(params.ownerId);
  const ownerName =
    (ownerData.user?.user_metadata?.full_name as string) ||
    ownerData.user?.email ||
    "Unbekannt";

  const { data: recipes } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("user_id", params.ownerId)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .returns<Recipe[]>();

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-12 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/library-shares"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              ← Geteilte Sammlungen
            </Link>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
                Sammlung von
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em] break-words">
              {ownerName}
            </h1>
          </div>
          <UserNav />
        </header>

        <RecipeList
          recipes={recipes ?? []}
          readOnly
          sharedCollectionOwnerId={params.ownerId}
        />
      </div>
    </div>
  );
}
