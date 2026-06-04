import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Next.js injects <link rel="manifest"> for us.
// start_url "/" hits the locale middleware and resolves to the default locale.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rezept-App",
    short_name: "Rezept",
    description: "Rezepte importieren und verwalten",
    id: "/",
    categories: ["food", "lifestyle"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "de",
    background_color: "#FAFAF7",
    theme_color: "#2D5F3F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Einkaufsliste",
        short_name: "Einkauf",
        url: "/shopping-list",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
