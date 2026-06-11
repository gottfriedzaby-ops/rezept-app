import Image from "next/image";
import { getRecipeGradient } from "@/lib/tag-colors";
import { isOptimizableImageHost } from "@/lib/image-host";
import type { RecipeType } from "@/types/recipe";

interface Props {
  imageUrl: string | null;
  title: string;
  tags: string[];
  variant?: "card" | "hero";
  /** Recipe category — selects the placeholder illustration when no image_url exists. */
  recipeType?: RecipeType | null;
}

function gradientBlurDataURL(from: string, to: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${from}'/><stop offset='100%' stop-color='${to}'/></linearGradient></defs><rect width='8' height='8' fill='url(%23g)'/></svg>`;
  const base64 =
    typeof window === "undefined"
      ? Buffer.from(svg, "utf8").toString("base64")
      : btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}


export default function RecipeCover({ imageUrl, title, tags, variant = "card", recipeType }: Props) {
  const [from, to] = getRecipeGradient(tags);
  const isHero = variant === "hero";

  if (imageUrl) {
    const blurDataURL = gradientBlurDataURL(from, to);
    const unoptimized = !isOptimizableImageHost(imageUrl);
    if (isHero) {
      return (
        <div className="w-full overflow-hidden">
          <Image
            src={imageUrl}
            alt={title}
            width={1200}
            height={420}
            priority
            sizes="100vw"
            placeholder="blur"
            blurDataURL={blurDataURL}
            unoptimized={unoptimized}
            className="w-full h-[260px] sm:h-[360px] lg:h-[420px] object-cover"
          />
        </div>
      );
    }
    return (
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={imageUrl}
          alt={title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          placeholder="blur"
          blurDataURL={blurDataURL}
          unoptimized={unoptimized}
          className="object-cover"
        />
      </div>
    );
  }

  // No source image (common for PDF imports and many URL imports): show a
  // category illustration that represents the recipe type. It is rendered
  // full-bleed like a real cover photo. The recipe title is always shown by the
  // surrounding card / page, so the illustration itself stays decorative.
  const category: RecipeType = recipeType ?? "kochen";
  const illustrationSrc = `/categories/${category}.svg`;

  if (isHero) {
    return (
      <div className="w-full overflow-hidden">
        <img
          src={illustrationSrc}
          alt=""
          aria-hidden="true"
          data-testid="recipe-cover-category-illustration"
          data-category={category}
          className="w-full h-[260px] sm:h-[360px] lg:h-[420px] object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden">
      <img
        src={illustrationSrc}
        alt=""
        aria-hidden="true"
        data-testid="recipe-cover-category-illustration"
        data-category={category}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}
