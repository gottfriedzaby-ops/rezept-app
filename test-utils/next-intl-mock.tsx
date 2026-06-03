import React from "react";
import { messages, translate } from "./intl";

// Jest mock for `next-intl` (mapped in jest.config.ts). Returns real German
// strings so existing assertions on translated text keep working without a
// provider.
export function useTranslations(namespace?: string) {
  return (key: string, values?: Record<string, unknown>): string =>
    translate(namespace, key, values);
}

export function useLocale(): string {
  return "de";
}

export function useMessages(): unknown {
  return messages;
}

export function hasLocale(locales: readonly string[], locale: unknown): locale is string {
  return typeof locale === "string" && locales.includes(locale);
}

export function NextIntlClientProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
