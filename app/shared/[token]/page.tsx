import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import RecipeList from "@/components/RecipeList";

export const dynamic = "force-dynamic";

export default async function SharedCollectionPage({
  params,
}: {
  params: { token: string };
}) {
  const { data: share } = await supabaseAdmin
    .from("shares")
    .select("owner_id, revoked_at, label")
    .eq("token", params.token)
    .single();

  if (!share || share.revoked_at) {
    return (
      <div className="min-h-screen bg-surface-primary flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="font-serif text-2xl font-medium text-ink-primary mb-3">
            Dieser Link ist nicht mehr gültig
          </h1>
          <p className="text-ink-secondary text-sm">
            Der Einladungslink wurde widerrufen oder existiert nicht.
          </p>
        </div>
      </div>
    );
  }

  const { data: recipes } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("user_id", share.owner_id)
    .order("created_at", { ascending: false })
    .returns<Recipe[]>();

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-8 py-16">
        <header className="mb-6">
          <div className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary bg-surface-secondary border border-border-secondary rounded px-2.5 py-1 mb-6">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10a2 2 0 100-4 2 2 0 000 4zm0 0v2m0-8V2m4 8h2M2 8h2" />
            </svg>
            Geteilte Sammlung — nur lesbar
          </div>
          <h1 className="font-serif text-5xl font-medium text-ink-primary tracking-[-0.02em] leading-tight">
            {share.label ? share.label : "Rezeptsammlung"}
          </h1>
        </header>

        <section>
          <p className="label-overline mb-8">Alle Rezepte</p>
          {!recipes || recipes.length === 0 ? (
            <p className="text-ink-secondary">Noch keine Rezepte in dieser Sammlung.</p>
          ) : (
            <RecipeList recipes={recipes} readOnly shareToken={params.token} />
          )}
        </section>
      </div>
    </div>
  );
}
