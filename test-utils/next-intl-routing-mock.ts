// Jest mock for `next-intl/routing` (mapped in jest.config.ts) — defineRouting
// just returns its config so `@/i18n/routing` keeps working under test.
export function defineRouting<T>(config: T): T {
  return config;
}
