interface RecipeListSkeletonProps {
  count?: number;
}

// Placeholder grid shown while the interactive RecipeList hydrates. Mirrors
// the card layout (cover 4:3, title bar, tag bar) so there is no layout shift.
export default function RecipeListSkeleton({ count = 6 }: RecipeListSkeletonProps) {
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="flex flex-col h-full border border-stone rounded overflow-hidden bg-white"
        >
          <div className="aspect-[4/3] bg-surface-secondary animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-5 w-3/4 rounded bg-surface-secondary animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-surface-secondary animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}
