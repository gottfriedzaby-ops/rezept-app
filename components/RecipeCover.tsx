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
