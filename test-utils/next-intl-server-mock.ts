import { messages, translate } from "./intl";

type Translator = (key: string, values?: Record<string, unknown>) => string;

// Jest mock for `next-intl/server` (mapped in jest.config.ts).
export async function getTranslations(
  arg?: string | { locale?: string; namespace?: string },
): Promise<Translator> {
  const namespace = typeof arg === "string" ? arg : arg?.namespace;
  return (key: string, values?: Record<string, unknown>) => translate(namespace, key, values);
}

export async function getMessages(): Promise<unknown> {
  return messages;
}
