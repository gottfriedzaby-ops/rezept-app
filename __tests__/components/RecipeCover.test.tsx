import React from "react";
import { render, screen } from "@testing-library/react";
import RecipeCover from "@/components/RecipeCover";

// next/image expects a Next.js runtime — replace with a plain <img> so we can
// inspect the props the component sets (src, placeholder, blurDataURL, sizes,
// unoptimized).
jest.mock("next/image", () => {
  return function Image(props: Record<string, unknown>) {
    const {
      src,
      alt,
      width,
      height,
      sizes,
      placeholder,
      blurDataURL,
      unoptimized,
      priority,
      className,
    } = props as {
      src: string;
      alt: string;
      width?: number;
      height?: number;
      sizes?: string;
      placeholder?: string;
      blurDataURL?: string;
      unoptimized?: boolean;
      priority?: boolean;
      className?: string;
    };
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        data-sizes={sizes}
        data-placeholder={placeholder}
        data-blur-data-url={blurDataURL}
        data-unoptimized={String(!!unoptimized)}
        data-priority={String(!!priority)}
        className={className}
      />
    );
  };
});

describe("RecipeCover", () => {
  describe("with an imageUrl (card variant)", () => {
    it("renders an <Image> with blur placeholder and responsive sizes", () => {
      render(
        <RecipeCover
          imageUrl="https://test.supabase.co/storage/v1/object/public/recipe-images/abc.jpg"
          title="Tomatensoße"
          tags={["pasta"]}
        />
      );

      const img = screen.getByAltText("Tomatensoße") as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.dataset.placeholder).toBe("blur");
      expect(img.dataset.blurDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(img.dataset.sizes).toContain("100vw");
      expect(img.dataset.sizes).toContain("33vw");
    });

    it("sets unoptimized=false for Supabase-hosted images", () => {
      render(
        <RecipeCover
          imageUrl="https://test.supabase.co/storage/v1/object/public/recipe-images/abc.jpg"
          title="Tomatensoße"
          tags={[]}
        />
      );
      const img = screen.getByAltText("Tomatensoße") as HTMLImageElement;
      expect(img.dataset.unoptimized).toBe("false");
    });

    it("sets unoptimized=true for non-Supabase images (e.g. URL imports)", () => {
      render(
        <RecipeCover
          imageUrl="https://chefkoch.de/og-image.jpg"
          title="Pasta"
          tags={[]}
        />
      );
      const img = screen.getByAltText("Pasta") as HTMLImageElement;
      expect(img.dataset.unoptimized).toBe("true");
    });

    it("sets unoptimized=true when the imageUrl is not a parseable URL", () => {
      render(<RecipeCover imageUrl="not a url" title="X" tags={[]} />);
      const img = screen.getByAltText("X") as HTMLImageElement;
      expect(img.dataset.unoptimized).toBe("true");
    });
  });

  describe("with an imageUrl (hero variant)", () => {
    it("uses fixed width/height and priority loading", () => {
      render(
        <RecipeCover
          imageUrl="https://test.supabase.co/storage/v1/object/public/recipe-images/abc.jpg"
          title="Hero Recipe"
          tags={[]}
          variant="hero"
        />
      );
      const img = screen.getByAltText("Hero Recipe") as HTMLImageElement;
      expect(img.getAttribute("width")).toBe("1200");
      expect(img.getAttribute("height")).toBe("420");
      expect(img.dataset.priority).toBe("true");
    });
  });

  describe("without an imageUrl (gradient fallback)", () => {
    it("renders the title text inside the gradient placeholder", () => {
      render(<RecipeCover imageUrl={null} title="Tomatensoße" tags={["pasta"]} />);

      expect(screen.getByText("Tomatensoße")).toBeInTheDocument();
      // No <img> should be rendered when imageUrl is null
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("hero fallback uses the larger text size class", () => {
      render(
        <RecipeCover
          imageUrl={null}
          title="Big Hero Title"
          tags={[]}
          variant="hero"
        />
      );
      const title = screen.getByText("Big Hero Title");
      // Hero variant adds the responsive lg:text-5xl class
      expect(title.className).toMatch(/text-3xl/);
      expect(title.className).toMatch(/sm:text-4xl/);
    });
  });
});
