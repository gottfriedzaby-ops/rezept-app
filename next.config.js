const createNextIntlPlugin = require('next-intl/plugin');
const withSerwistInit = require('@serwist/next').default;
const { withSentryConfig } = require('@sentry/nextjs');

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
    // Next 14 needs the flag for instrumentation.ts (Sentry server init)
    instrumentationHook: true,
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

// Sentry is a no-op without NEXT_PUBLIC_SENTRY_DSN; source-map upload only
// runs when SENTRY_AUTH_TOKEN is configured (e.g. in Vercel).
module.exports = withSentryConfig(withSerwist(withNextIntl(nextConfig)), {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
