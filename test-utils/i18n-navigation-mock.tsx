import React from "react";

// Jest mock for `@/i18n/navigation` (mapped in jest.config.ts). Tests that need
// to assert router calls override useRouter with their own jest.mock.
export function Link(props: React.ComponentProps<"a">): React.ReactElement {
  return <a {...props} />;
}

export function usePathname(): string {
  return "/";
}

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
    refresh: () => {},
  };
}

export function redirect(href: string): never {
  throw new Error(`NEXT_REDIRECT:${href}`);
}

export function getPathname(): string {
  return "/";
}
