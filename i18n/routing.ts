import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['de', 'en', 'nl'] as const,
  defaultLocale: 'de',
});

export type Locale = (typeof routing.locales)[number];
