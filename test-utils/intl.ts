import messages from "../messages/de.json";

type JsonObject = { [key: string]: unknown };

// Resolves a next-intl message key (with optional namespace) from the real
// German messages and applies {var} interpolation plus the flat
// `{name, plural, one {…} other {…}}` ICU form used in this codebase. Returns
// the key path when a message is missing, so test failures point at the
// offending key.
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
  const withPlurals = current.replace(
    /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g,
    (_match, name: string, one: string, other: string) => {
      const n = Number(values[name]);
      return (n === 1 ? one : other).replace(/#/g, String(values[name]));
    },
  );
  return withPlurals.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in values ? String(values[name]) : `{${name}}`,
  );
}

// Like `translate`, but returns the raw message value (string, array or
// object) for use with next-intl's `t.raw`. Returns the key path when missing.
export function translateRaw(namespace: string | undefined, key: string): unknown {
  const path = namespace ? `${namespace}.${key}` : key;
  let current: unknown = messages;
  for (const part of path.split(".")) {
    if (current !== null && typeof current === "object" && part in (current as JsonObject)) {
      current = (current as JsonObject)[part];
    } else {
      return path;
    }
  }
  return current;
}

export { messages };
