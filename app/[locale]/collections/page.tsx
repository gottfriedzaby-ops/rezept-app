import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import CollectionManager from "@/components/CollectionManager";
import UserNav from "@/components/UserNav";
import type { Collection, CollectionWithCount } from "@/types/collection";

export const dynamic = "force-dynamic";

type CollectionCountRow = Collection & {
  collection_recipes: { count: number }[] | null;
};

export default async function CollectionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/collections");

  const [t, tCommon] = await Promise.all([
    getTranslations("Collections"),
    getTranslations("Common"),
  ]);

  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("*, collection_recipes(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      // Migration not applied yet — render the empty state instead of crashing.
      console.warn(
        "[collections] Tabelle 'collections' fehlt — Migration 20260611000004_feature17_discovery.sql ausführen."
      );
    } else {
      console.error("[collections] query failed:", error.message);
    }
  }

  const collections: CollectionWithCount[] = ((data ?? []) as CollectionCountRow[]).map(
    ({ collection_recipes, ...rest }) => ({
      ...rest,
      recipe_count: collection_recipes?.[0]?.count ?? 0,
    })
  );

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              {tCommon("allRecipes")}
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em]">
              {t("title")}
            </h1>
          </div>
          <UserNav />
        </header>

        <CollectionManager collections={collections} />
      </div>
    </div>
  );
}
