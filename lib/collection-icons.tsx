import type { ReactElement, ReactNode } from "react";
import type { SmartCollectionKey } from "@/lib/collection-suggestions";
import { iconKeyForCollectionName } from "@/lib/collection-suggestions";

/**
 * Gestaltete Inline-SVG-Icons für die Smart-Collections (Feature 20).
 *
 * Konvention wie im restlichen Projekt (vgl. Ordner-Icon in
 * `components/CollectionsStrip.tsx`): `stroke="currentColor"`, Größe/Farbe via
 * `className` (z. B. `text-forest w-5 h-5`), dekorativ (`aria-hidden`). So erben
 * die Icons die Forest-Palette und passen sich Light/Dark an.
 */

export interface CollectionIconProps {
  className?: string;
}

type IconComponent = (props: CollectionIconProps) => ReactElement;

function Svg({ className, children }: CollectionIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const FolderIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </Svg>
);

// ─── Wichtigste Kategorien — gestaltete Icons ────────────────────────────────

const DrinksIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M5 4h14l-7 8z" />
    <path d="M12 12v6" />
    <path d="M8 20h8" />
    <circle cx="15" cy="6.5" r="1" />
  </Svg>
);

const DessertsIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M6 10c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M6.5 10h11l-1.3 8.6a1.5 1.5 0 0 1-1.5 1.3H9.3a1.5 1.5 0 0 1-1.5-1.3L6.5 10z" />
    <path d="M9.5 10v9M14.5 10v9" />
    <circle cx="12" cy="4" r="0.6" />
  </Svg>
);

const BakingIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M4 20h16" />
    <path d="M5 20v-6h14v6" />
    <path d="M5 14c0-2.5 3.1-4 7-4s7 1.5 7 4" />
    <path d="M12 7v3" />
    <path d="M12 4.5c.9.6.9 1.6 0 2.5-.9-.9-.9-1.9 0-2.5z" />
  </Svg>
);

const SoupsIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M3.5 11h17" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M9 3.5c.8 1.2-.8 1.8 0 3M13 3.5c.8 1.2-.8 1.8 0 3" />
  </Svg>
);

const SaladsIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M3.5 12h17" />
    <path d="M5 12a7 7 0 0 0 14 0" />
    <path d="M12 12c-1-3 1-6 4.5-6.5C16.8 8.6 15 11.4 12 12z" />
    <path d="M12 12c-.6-2.2-2.7-3.6-5.5-3.4C7 11 9.2 12.2 12 12z" />
  </Svg>
);

const GrillingIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M12 3c2.6 3.4 4.5 4.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.6.8-2.7 1.8-3.7.2 1 .9 1.8 1.7 1.8 1 0 1.4-1.4.6-3 .4-.9 1-2 .4-3.9z" />
  </Svg>
);

const BreakfastIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
    <path d="M16 10h2.5a2 2 0 0 1 0 4H16" />
    <path d="M7 3c.7 1-.7 1.7 0 2.8M11 3c.7 1-.7 1.7 0 2.8" />
  </Svg>
);

// ─── Übrige Kategorien — schlichte, eigenständige Icons ───────────────────────

const PastaIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M4 13h16" />
    <path d="M5 13a7 7 0 0 0 14 0" />
    <path d="M8 13c0-3 1-7 2-9M12 13c0-3 .5-7 .5-9M16 13c0-3-1-7-2-9" />
  </Svg>
);

const MeatIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M14 4a4.5 4.5 0 0 1 3.6 7.2c-1 1.3-2.6 1.6-3.8 2.6L11 16.5 8 13.5l2.7-2.8c1-1.2 1.3-2.8 2.6-3.8A4.5 4.5 0 0 1 14 4z" />
    <path d="M8 13.5 4 17.5" />
    <path d="M4 15l.6 3.9 3.9.6" />
  </Svg>
);

const FishIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M3 12c3.5-4.5 10-4.5 14 0-4 4.5-10.5 4.5-14 0z" />
    <path d="M17 12l4-3v6z" />
    <circle cx="7" cy="10.8" r="0.7" />
  </Svg>
);

const VegetarianIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M12 21v-9" />
    <path d="M12 14c0-5 1-8 7-9-1 6-3 9-7 9z" />
    <path d="M12 16c0-3-1-5-6-5.5C6.5 14 8.5 16 12 16z" />
  </Svg>
);

const QuickIcon: IconComponent = ({ className }) => (
  <Svg className={className}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z" />
  </Svg>
);

/** Icon-Komponente je Kategorie-Key. */
export const SMART_ICON_BY_KEY: Record<SmartCollectionKey, IconComponent> = {
  drinks: DrinksIcon,
  desserts: DessertsIcon,
  baking: BakingIcon,
  soups: SoupsIcon,
  salads: SaladsIcon,
  grilling: GrillingIcon,
  breakfast: BreakfastIcon,
  pasta: PastaIcon,
  meat: MeatIcon,
  fish: FishIcon,
  vegetarian: VegetarianIcon,
  quick: QuickIcon,
};

export interface CollectionIconComponentProps {
  /** Direkter Kategorie-Key (für Vorschlagskarten). Hat Vorrang vor `name`. */
  smartKey?: SmartCollectionKey;
  /** Sammlungsname (für bestehende/umbenannte Sammlungen → Mapping auf Key). */
  name?: string;
  className?: string;
}

/**
 * Rendert das passende Smart-Icon — direkt über `smartKey` oder abgeleitet aus
 * `name` — und fällt auf das Ordner-Icon zurück, wenn nichts passt. Damit
 * bekommen auch bestehende Sammlungen Icons (nicht-brechende Aufwertung).
 */
export function CollectionIcon({ smartKey, name, className }: CollectionIconComponentProps) {
  const key = smartKey ?? (name ? iconKeyForCollectionName(name) : null);
  const Icon = key ? SMART_ICON_BY_KEY[key] : FolderIcon;
  return <Icon className={className} />;
}
