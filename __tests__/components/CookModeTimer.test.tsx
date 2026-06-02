import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import CookMode from "@/components/CookMode";
import type { Recipe, Step } from "@/types/recipe";

// next-intl ships ESM that ts-jest does not transform, and the component renders
// without an <NextIntlClientProvider>. Mock useTranslations to resolve against the
// real German messages so assertions match what users actually see.
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

// Mock AudioContext so playBeep() works in jsdom and we can assert beeps.
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

// Mock navigator.wakeLock
const mockRelease = jest.fn().mockResolvedValue(undefined);
const mockWakeLock = { request: jest.fn().mockResolvedValue({ release: mockRelease, released: false }) };
Object.defineProperty(global.navigator, "wakeLock", {
  value: mockWakeLock,
  configurable: true,
  writable: true,
});

function makeRecipe(steps: Step[]): Recipe {
  return {
    id: "cook-recipe",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    title: "Pasta",
    description: null,
    servings: 2,
    prep_time: 5,
    cook_time: 20,
    recipe_type: "kochen",
    ingredients: [{ amount: 200, unit: "g", name: "Nudeln" }],
    steps,
    sections: null,
    tags: ["pasta"],
    source_type: "manual",
    source_value: "manual",
    source_title: null,
    image_url: null,
    step_images: null,
    favorite: false,
    scalable: true,
    is_private: false,
    kcal_per_serving: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    nutrition_breakdown: null,
  };
}

// Default recipe: step 1 no timer, step 2 = 480s (08:00), step 3 no timer.
const defaultSteps: Step[] = [
  { order: 1, text: "Wasser kochen.", timerSeconds: null },
  { order: 2, text: "Pasta hinzufügen.", timerSeconds: 480 },
  { order: 3, text: "Abgießen und servieren.", timerSeconds: null },
];

// Advance fake timers one second at a time, flushing React updates between ticks.
function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

const next = () => fireEvent.click(screen.getByText(/Weiter/));
const prev = () => fireEvent.click(screen.getByText(/Zurück/));

describe("CookMode — persistent timer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a step's configured duration as ready to start (not running)", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    next(); // step 2 (480s)
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("Timer starten")).toBeInTheDocument();
  });

  it("counts down once started", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    next();
    fireEvent.click(screen.getByText("Timer starten"));
    expect(screen.getByText("Timer pausieren")).toBeInTheDocument();
    tick(3);
    expect(screen.getByText("07:57")).toBeInTheDocument();
  });

  it("keeps the timer running when navigating to a later step", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    next(); // step 2
    fireEvent.click(screen.getByText("Timer starten"));
    tick(5); // 07:55
    next(); // step 3 — has no timer of its own

    // The timer survives in the banner and keeps ticking.
    expect(screen.getByText("07:55")).toBeInTheDocument();
    expect(screen.getByText(/Schritt 2 von 3/)).toBeInTheDocument(); // banner labels the owning step
    tick(2);
    expect(screen.getByText("07:53")).toBeInTheDocument();
  });

  it("does not reset the value when navigating back and forth", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    next(); // step 2
    fireEvent.click(screen.getByText("Timer starten"));
    tick(3); // 07:57
    prev(); // step 1
    next(); // back to step 2

    expect(screen.getByText("07:57")).toBeInTheDocument(); // not reset to 08:00
    expect(screen.getByText("Timer pausieren")).toBeInTheDocument(); // still running
  });

  it("beeps at zero even while viewing a different step", () => {
    const steps: Step[] = [
      { order: 1, text: "A", timerSeconds: null },
      { order: 2, text: "B", timerSeconds: 2 },
      { order: 3, text: "C", timerSeconds: null },
      { order: 4, text: "D", timerSeconds: null },
    ];
    render(<CookMode recipe={makeRecipe(steps)} initialServings={2} />);
    next(); // step 2 (2s)
    fireEvent.click(screen.getByText("Timer starten"));
    next(); // step 3 — timer keeps running in the banner
    tick(2); // reaches 0

    expect(global.AudioContext).toHaveBeenCalled(); // beep fired despite being on another step
    const banner = screen.getByRole("group");
    expect(within(banner).getByText(/Fertig!/)).toBeInTheDocument();
  });

  it("clears the timer when reset from the banner", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    next(); // step 2
    fireEvent.click(screen.getByText("Timer starten"));
    tick(3);
    next(); // step 3 — banner visible, step 3 has no own timer

    fireEvent.click(screen.getByText("Timer zurücksetzen")); // only the banner's reset exists here
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument(); // banner gone
  });

  it("shows the running timer back in the main area when returning to its step", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    next(); // step 2
    fireEvent.click(screen.getByText("Timer starten"));
    tick(5); // 07:55
    next(); // step 3 (banner)
    prev(); // back to step 2

    expect(screen.queryByRole("group")).not.toBeInTheDocument(); // banner gone
    expect(screen.getByText("07:55")).toBeInTheDocument(); // live in the main area
    expect(screen.getByText("Timer pausieren")).toBeInTheDocument();
  });

  it("hides another step's own timer while a timer is running (single timer)", () => {
    const steps: Step[] = [
      { order: 1, text: "A", timerSeconds: 300 }, // 05:00
      { order: 2, text: "B", timerSeconds: 600 }, // 10:00
      { order: 3, text: "C", timerSeconds: null },
    ];
    render(<CookMode recipe={makeRecipe(steps)} initialServings={2} />);
    fireEvent.click(screen.getByText("Timer starten")); // start step 1's timer
    next(); // step 2 — has its own 600s timer

    expect(screen.queryByText("10:00")).not.toBeInTheDocument(); // step 2's timer is not offered
    const banner = screen.getByRole("group");
    expect(within(banner).getByText(/Schritt 1 von 3/)).toBeInTheDocument();
    expect(within(banner).getByText("05:00")).toBeInTheDocument();
  });

  it("'t' starts then pauses the current step's timer", () => {
    render(<CookMode recipe={makeRecipe(defaultSteps)} initialServings={2} />);
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" }); // step 2
    });
    act(() => {
      fireEvent.keyDown(window, { key: "t" });
    });
    expect(screen.getByText("Timer pausieren")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "t" });
    });
    expect(screen.getByText("Timer starten")).toBeInTheDocument();
  });
});
