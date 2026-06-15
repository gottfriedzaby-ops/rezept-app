import React from "react";
import { messages, translate, translateRaw } from "./intl";

// Jest mock for `next-intl` (mapped in jest.config.ts). Returns real German
// strings so existing assertions on translated text keep working without a
// provider. `.raw` mirrors next-intl's raw lookup (arrays/objects).
export function useTranslations(namespace?: string) {
  const t = (key: string, values?: Record<string, unknown>): string =>
    translate(namespace, key, values);
  return Object.assign(t, {
    raw: (key: string): unknown => translateRaw(namespace, key),
  });
}

export function useLocale(): string {
  return "de";
}

export function useFormatter() {
  return {
    dateTime: (date: Date, options?: Intl.DateTimeFormatOptions): string =>
      new Intl.DateTimeFormat("de-DE", options).format(date),
    number: (value: number, options?: Intl.NumberFormatOptions): string =>
      new Intl.NumberFormat("de-DE", options).format(value),
  };
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
