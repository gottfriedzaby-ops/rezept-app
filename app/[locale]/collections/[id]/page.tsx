import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import RecipeList from "@/components/RecipeList";
import UserNav from "@/components/UserNav";
import type { Collection } from "@/types/collection";
import type { Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";

type MemberRow = { added_at: string; recipe: Recipe | null };

export default async function CollectionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/collections");

  const t = await getTranslations("Collections");

  const { data: collectionData, error: collectionError } = await supabaseAdmin
    .from("collections")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (collectionError) {
    if (collectionError.code === "42P01") {
      console.warn(
        "[collections] Tabelle 'collections' fehlt — Migration 20260611000004_feature17_discovery.sql ausführen."
      );
    } else {
      console.error("[collections] query failed:", collectionError.message);
    }
    notFound();
  }

  const collection = collectionData as Collection | null;
  if (!collection) notFound();

  const { data: memberRows, error: membersError } = await supabaseAdmin
    .from("collection_recipes")
    .select("added_at, recipe:recipes(*)")
    .eq("collection_id", collection.id)
    .order("added_at", { ascending: false });

  if (membersError) {
    console.error("[collections] recipes query failed:", membersError.message);
  }

  const recipes = ((memberRows ?? []) as unknown as MemberRow[])
    .map((row) => row.recipe)
    .filter((recipe): recipe is Recipe => recipe !== null);

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/collections"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              {t("backToCollections")}
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em] break-words">
              {collection.name}
            </h1>
          </div>
          <UserNav />
        </header>

        {recipes.length === 0 ? (
          <p className="text-ink-secondary text-sm">{t("emptyCollection")}</p>
        ) : (
          <RecipeList recipes={recipes} />
        )}
      </div>
    </div>
  );
}
