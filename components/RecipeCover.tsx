import { getRecipeGradient } from "@/lib/tag-colors";

interface Props {
  imageUrl: string | null;
  title: string;
  tags: string[];
  variant?: "card" | "hero";
}

export default function RecipeCover({ imageUrl, title, tags, variant = "card" }: Props) {
  const [from, to] = getRecipeGradient(tags);
  const isHero = variant === "hero";

  if (imageUrl) {
    return (
      <div className={isHero ? "w-full overflow-hidden" : "aspect-[4/3] overflow-hidden"}>
        <img
          src={imageUrl}
          alt={title}
          className={`w-full object-cover ${isHero ? "h-[260px] sm:h-[360px] lg:h-[420px]" : "h-full"}`}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center ${
        isHero
          ? "w-full h-[220px] sm:h-[300px] lg:h-[360px]"
          : "aspect-[4/3] p-6"
      }`}
      style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
    >
      <p
        className={`font-serif font-medium text-ink-primary text-center tracking-[-0.01em] ${
          isHero ? "text-3xl sm:text-4xl lg:text-5xl px-8 max-w-[680px]" : "text-base leading-snug"
        }`}
      >
        {title}
      </p>
    </div>
  );
}
