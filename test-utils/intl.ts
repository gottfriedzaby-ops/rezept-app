import messages from "../messages/de.json";

type JsonObject = { [key: string]: unknown };

// Resolves a next-intl message key (with optional namespace) from the real
// German messages and applies {var} interpolation. Returns the key path when a
// message is missing, so test failures point at the offending key. The app's
// messages use no ICU plurals/select or rich text, so this simple resolver
// matches next-intl's behaviour for this codebase.
export function translate(
  namespace: string | undefined,
  key: string,
  values?: Record<string, unknown>,
): string {
  const path = namespace ? `${namespace}.${key}` : key;
  let current: unknown = messages;
  for (const part of path.split(".")) {
    if (current !== null && typeof current === "object" && part in (current as JsonObject)) {
      current = (current as JsonObject)[part];
    } else {
      return path;
    }
  }
  if (typeof current !== "string") return path;
  if (!values) return current;
  return current.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in values ? String(values[name]) : `{${name}}`,
  );
}

export { messages };
