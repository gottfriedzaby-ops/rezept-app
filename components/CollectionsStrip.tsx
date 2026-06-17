import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CollectionIcon } from "@/lib/collection-icons";
import type { CollectionWithCount } from "@/types/collection";

interface CollectionsStripProps {
  collections: CollectionWithCount[];
}

/**
 * Kompakte Sammlungs-Übersicht für die Startseite: eine Reihe verlinkter
 * Chips mit Rezeptanzahl plus „Alle ansehen"-Link zur Verwaltung. Wird nur
 * gerendert, wenn der Nutzer mindestens eine Sammlung besitzt (Prüfung erfolgt
 * beim Aufrufer).
 */
export default async function CollectionsStrip({ collections }: CollectionsStripProps) {
  const t = await getTranslations("Collections");

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-3">
        <p className="label-overline">{t("title")}</p>
        <Link
          href="/collections"
          className="text-sm text-ink-tertiary hover:text-ink-primary transition-colors whitespace-nowrap"
        >
          {t("viewAll")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.id}`}
            aria-label={`${collection.name} – ${t("recipeCount", { count: collection.recipe_count })}`}
            className="inline-flex items-center gap-2.5 rounded-full border border-stone bg-surface-card px-4 py-2 hover:border-ink-secondary hover:shadow-sm transition-all"
          >
            <CollectionIcon name={collection.name} className="w-4 h-4 text-forest shrink-0" />
            <span className="text-sm font-medium text-ink-primary">{collection.name}</span>
            <span className="text-xs text-ink-tertiary tabular-nums">
              {collection.recipe_count}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
