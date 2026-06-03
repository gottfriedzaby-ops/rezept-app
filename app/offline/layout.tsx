import type { Metadata, Viewport } from "next";
import "../globals.css";

// Standalone layout for the PWA offline fallback. It lives outside [locale] so
// the service worker can precache a single, stable /offline URL, and therefore
// provides its own <html>/<body> (the locale layout normally does this).
export const metadata: Metadata = {
  title: "Offline · Rezept-App",
};

export const viewport: Viewport = {
  themeColor: "#2D5F3F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="font-sans antialiased bg-surface-primary text-ink-primary">
        {children}
      </body>
    </html>
  );
}
