const createNextIntlPlugin = require('next-intl/plugin');
const withSerwistInit = require('@serwist/next').default;

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Revision for the precached offline page; changes per build so the cached
// copy refreshes on each deploy.
const offlineRevision = `${Date.now()}`;

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Build & register the service worker in production only; keeps `next dev` clean.
  disable: process.env.NODE_ENV === 'development',
  // The /offline fallback is a prerendered HTML route, which is not part of the
  // default (build-asset) precache manifest — add it explicitly so the service
  // worker can serve it when a navigation fails offline.
  additionalPrecacheEntries: [
    { url: '/offline', revision: offlineRevision },
    { url: '/offline/recipe', revision: offlineRevision },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["heic-convert", "mupdf"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = withSerwist(withNextIntl(nextConfig));
