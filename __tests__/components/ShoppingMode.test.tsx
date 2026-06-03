import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ShoppingMode from "@/components/ShoppingMode";
import { STORAGE_KEY, SORT_MODE_KEY, getList, type ShoppingListItem } from "@/lib/shopping-list";

// next-intl ships ESM that ts-jest does not transform, and the component renders
// without an <NextIntlClientProvider>. Resolve against the real German messages.
jest.mock("next-intl", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const messages = require("@/messages/de.json") as Record<string, Record<string, string>>;
  return {
    useTranslations: (namespace: string) =>
      (key: string, params?: Record<string, string | number>) => {
        const template = messages[namespace]?.[key] ?? key;
        return params
          ? template.replace(/\{(\w+)\}/g, (_: string, name: string) =>
              String(params[name] ?? `{${name}}`)
            )
          : template;
      },
  };
});

// @/i18n/navigation wraps next-intl/navigation (also ESM) — stub its Link.
jest.mock("@/i18n/navigation", () => ({
  Link: function Link({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

// AudioContext so playBeep() works in jsdom and we can assert the "done" chime.
const mockOscillator = {
  connect: jest.fn(),
  type: "sine",
  frequency: { value: 0 },
  start: jest.fn(),
  stop: jest.fn(),
};
const mockGain = {
  connect: jest.fn(),
  gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
};
const mockAudioCtx = {
  createOscillator: jest.fn().mockReturnValue(mockOscillator),
  createGain: jest.fn().mockReturnValue(mockGain),
  destination: {},
  currentTime: 0,
};
global.AudioContext = jest.fn().mockImplementation(() => mockAudioCtx) as unknown as typeof AudioContext;

// navigator.wakeLock + navigator.vibrate (absent in jsdom).
const mockRelease = jest.fn().mockResolvedValue(undefined);
const mockWakeLock = { request: jest.fn().mockResolvedValue({ release: mockRelease, released: false }) };
Object.defineProperty(global.navigator, "wakeLock", {
  value: mockWakeLock,
  configurable: true,
  writable: true,
});
Object.defineProperty(global.navigator, "vibrate", {
  value: jest.fn(),
  configurable: true,
  writable: true,
});

function setMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

let idCounter = 0;
function makeItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: `id-${idCounter++}`,
    recipe_id: "r1",
    recipe_title: "Recipe A",
    ingredient_name: "Tomaten",
    amount: 200,
    unit: "g",
    checked: false,
    added_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function seed(items: ShoppingListItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

beforeEach(() => {
  localStorage.clear();
  setMatchMedia(false);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: {}, error: null }),
  }) as unknown as typeof fetch;
});

describe("ShoppingMode — checking items", () => {
  it("renders rows from the store and persists a tap", () => {
    // Two items so the section isn't fully checked (and thus not auto-collapsed)
    // after a single tap — the tapped row stays on screen.
    seed([
      makeItem({ id: "a", ingredient_name: "Tomaten", amount: 200, unit: "g" }),
      makeItem({ id: "b", ingredient_name: "Mehl", amount: 100, unit: "g" }),
    ]);
    render(<ShoppingMode />);

    const btn = screen.getByRole("button", { name: "200 g Tomaten" });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(btn);

    expect(screen.getByRole("button", { name: "200 g Tomaten" })).toHaveAttribute("aria-pressed", "true");
    expect(getList().find((i) => i.id === "a")?.checked).toBe(true);
  });

  it("by type: merges same name+unit into one row and a tap checks all contributors", () => {
    localStorage.setItem(SORT_MODE_KEY, "type");
    seed([
      makeItem({ id: "a", ingredient_name: "Tomaten", amount: 200, unit: "g", recipe_id: "r1" }),
      makeItem({ id: "b", ingredient_name: "Tomaten", amount: 100, unit: "g", recipe_id: "r2", recipe_title: "Recipe B" }),
    ]);
    render(<ShoppingMode />);

    const row = screen.getByRole("button", { name: "300 g Tomaten" });
    fireEvent.click(row);

    const list = getList();
    expect(list).toHaveLength(2);
    expect(list.every((i) => i.checked)).toBe(true);
  });
});

describe("ShoppingMode — progress", () => {
  it("tracks checked items via the progressbar", () => {
    seed([
      makeItem({ id: "a", ingredient_name: "Tomaten", amount: 200, unit: "g" }),
      makeItem({ id: "b", ingredient_name: "Mehl", amount: 100, unit: "g" }),
    ]);
    render(<ShoppingMode />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "2");

    fireEvent.click(screen.getByRole("button", { name: "200 g Tomaten" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  });
});

describe("ShoppingMode — celebration", () => {
  it("shows the done banner and plays the chime when the last item is checked", () => {
    seed([makeItem({ id: "a", ingredient_name: "Tomaten", amount: 200, unit: "g" })]);
    render(<ShoppingMode />);

    expect(screen.queryByText(/Alles erledigt/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "200 g Tomaten" }));

    expect(screen.getByText(/Alles erledigt/)).toBeInTheDocument();
    expect(global.AudioContext).toHaveBeenCalled();
  });
});

describe("ShoppingMode — sink to bottom", () => {
  it("moves a checked row below the unchecked ones", () => {
    seed([
      makeItem({ id: "a", ingredient_name: "Apfel", amount: 1, unit: "", recipe_title: "R" }),
      makeItem({ id: "b", ingredient_name: "Banane", amount: 2, unit: "", recipe_title: "R" }),
    ]);
    render(<ShoppingMode />);

    const rowLabels = () =>
      screen
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label"))
        .filter((l): l is string => !!l && /Apfel|Banane/.test(l));

    expect(rowLabels()).toEqual(["1 Apfel", "2 Banane"]);

    fireEvent.click(screen.getByRole("button", { name: "1 Apfel" }));
    expect(rowLabels()[0]).toBe("2 Banane");
  });
});

describe("ShoppingMode — wake lock & reduced motion", () => {
  it("requests a screen wake lock on mount", () => {
    seed([makeItem({ id: "a", ingredient_name: "Tomaten", amount: 1, unit: "" })]);
    render(<ShoppingMode />);
    expect(mockWakeLock.request).toHaveBeenCalledWith("screen");
  });

  it("applies the pop animation class normally", () => {
    seed([
      makeItem({ id: "a", ingredient_name: "Tomaten", amount: 1, unit: "", checked: true }),
      makeItem({ id: "b", ingredient_name: "Mehl", amount: 1, unit: "", checked: false }),
    ]);
    render(<ShoppingMode />);
    expect(document.querySelector(".shopping-pop")).not.toBeNull();
  });

  it("omits the pop animation under prefers-reduced-motion", () => {
    setMatchMedia(true);
    seed([
      makeItem({ id: "a", ingredient_name: "Tomaten", amount: 1, unit: "", checked: true }),
      makeItem({ id: "b", ingredient_name: "Mehl", amount: 1, unit: "", checked: false }),
    ]);
    render(<ShoppingMode />);

    expect(screen.getByRole("button", { name: "1 Tomaten" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".shopping-pop")).toBeNull();
  });
});

describe("ShoppingMode — empty list", () => {
  it("shows the empty state without crashing", () => {
    render(<ShoppingMode />);
    expect(screen.getByText("Deine Einkaufsliste ist leer")).toBeInTheDocument();
  });
});
