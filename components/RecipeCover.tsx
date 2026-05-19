import Image from "next/image";
import { getRecipeGradient } from "@/lib/tag-colors";

interface Props {
  imageUrl: string | null;
  title: string;
  tags: string[];
  variant?: "card" | "hero";
}

function gradientBlurDataURL(from: string, to: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${from}'/><stop offset='100%' stop-color='${to}'/></linearGradient></defs><rect width='8' height='8' fill='url(%23g)'/></svg>`;
  const base64 =
    typeof window === "undefined"
      ? Buffer.from(svg, "utf8").toString("base64")
      : btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

function isOptimizableHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export default function RecipeCover({ imageUrl, title, tags, variant = "card" }: Props) {
  const [from, to] = getRecipeGradient(tags);
  const isHero = variant === "hero";

  if (imageUrl) {
    const blurDataURL = gradientBlurDataURL(from, to);
    const unoptimized = !isOptimizableHost(imageUrl);
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

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        isHero
          ? "w-full h-[220px] sm:h-[300px] lg:h-[360px]"
          : "aspect-[4/3] p-6"
      }`}
      style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
    >
      <ChefHatIcon className={isHero ? "w-16 h-16 sm:w-20 sm:h-20" : "w-10 h-10"} />
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

function ChefHatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`text-ink-primary/40 ${className ?? ""}`}
      data-testid="recipe-cover-placeholder-icon"
    >
      {/* Hat top — three rounded puffs */}
      <path d="M6 11a4 4 0 1 1 1.7-7.6A4.5 4.5 0 0 1 16.3 3.4 4 4 0 1 1 18 11" />
      {/* Hat band */}
      <path d="M6 11h12v4H6z" />
      {/* Vertical pleats on the band */}
      <path d="M10 11v4M14 11v4" />
    </svg>
  );
}
