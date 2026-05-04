import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { ImportProvider } from "@/contexts/ImportContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ImportStatusPill from "@/components/ImportStatusPill";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rezept-App",
  description: "Rezepte importieren und verwalten",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased bg-surface-primary text-ink-primary">
        <AuthProvider>
          <ImportProvider>
            {children}
            <ImportStatusPill />
          </ImportProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
