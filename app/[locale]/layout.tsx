import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { getMessages } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { ImportProvider } from "@/contexts/ImportContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AnalyticsProvider } from "@/contexts/AnalyticsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import ImportStatusPill from "@/components/ImportStatusPill";
import WhatsNewPopup from "@/components/WhatsNewPopup";
import "../globals.css";

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
  appleWebApp: {
    capable: true,
    title: "Rezept",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#2D5F3F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the stored/system theme before paint to avoid a light flash */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("rezept-app:theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();',
          }}
        />
      </head>
      <body className="font-sans antialiased bg-surface-primary text-ink-primary">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <AnalyticsProvider>
              <ToastProvider>
                <ImportProvider>
                  {children}
                  <ImportStatusPill />
                  <WhatsNewPopup />
                </ImportProvider>
              </ToastProvider>
            </AnalyticsProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
