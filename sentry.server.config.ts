import * as Sentry from "@sentry/nextjs";

// No-op without a DSN — local dev and forks run clean.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Claude prompts/recipe content can contain personal notes — never send
  // request bodies.
  sendDefaultPii: false,
});
