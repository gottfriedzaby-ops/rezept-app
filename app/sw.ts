/// <reference lib="webworker" />
// Serwist service-worker source. Compiled to /public/sw.js by @serwist/next.
// This file is excluded from the app tsconfig (it runs in a ServiceWorker, not
// DOM, context) and is bundled by Serwist's own webpack pass.
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Recipe images upload to a unique (content-addressed) filename per image, so a
// CacheFirst strategy is safe: a changed image gets a new URL. This gives
// instant, offline-capable images for recipes the user has already opened.
const imageCache = new CacheFirst({
  cacheName: "recipe-images",
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      purgeOnQuotaError: true,
    }),
  ],
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // next/image-optimised images (the dominant path for recipe photos).
    { matcher: ({ url }) => url.pathname === "/_next/image", handler: imageCache },
    // Direct Supabase storage URLs (images loaded without next/image).
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        url.pathname.includes("/storage/v1/object/public/"),
      handler: imageCache,
    },
    // Serwist's recommended Next.js defaults handle everything else. These use
    // NetworkFirst for HTML/RSC, so online navigations are always fresh — the
    // cache only ever serves as an offline fallback.
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // Shown when a document request fails and nothing is cached. Lives
        // outside [locale] so it has a single stable URL the SW can precache.
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// Web Push: show the notification, and focus/open the app on click.
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    // non-JSON payload — fall back to defaults
  }
  const title = data.title || "Rezept-App";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          try {
            await client.navigate(url);
          } catch {
            // navigation may be disallowed; focusing is enough
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
