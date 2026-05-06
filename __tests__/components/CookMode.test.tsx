import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CookMode from "@/components/CookMode";
import type { Recipe } from "@/types/recipe";

jest.mock("next/link", () => {
  return function Link({
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
  };
});

// Mock AudioContext to prevent "not implemented" errors in jsdom
const mockOscillator = {
  connect: jest.fn(),
  type: "sine",
  frequency: { value: 0 },
  start: jest.fn(),
  stop: jest.fn(),
};
const mockGain = {
  connect: jest.fn(),
  gain: {
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
  },
};
const mockAudioCtx = {
  createOscillator: jest.fn().mockReturnValue(mockOscillator),
  createGain: jest.fn().mockReturnValue(mockGain),
  destination: {},
  currentTime: 0,
};
global.AudioContext = jest.fn().mockImplementation(() => mockAudioCtx);

// Mock navigator.wakeLock
const mockRelease = jest.fn().mockResolvedValue(undefined);
const mockWakeLock = { request: jest.fn().mockResolvedValue({ release: mockRelease, released: false }) };
Object.defineProperty(global.navigator, "wakeLock", {
  value: mockWakeLock,
  configurable: true,
  writable: true,
});

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
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
    steps: [
      { order: 1, text: "Wasser kochen.", timerSeconds: null },
      { order: 2, text: "Pasta hinzufügen.", timerSeconds: 480 },
      { order: 3, text: "Abgießen und servieren.", timerSeconds: null },
    ],
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
    ...overrides,
  };
}

describe("CookMode — step navigation", () => {
  it("shows the first step on initial render", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    expect(screen.getByText("Wasser kochen.")).toBeInTheDocument();
  });

  it("displays step counter as '1 / 3'", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("navigates to the next step when 'Weiter' is clicked", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    expect(screen.getByText("Pasta hinzufügen.")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("navigates back to the previous step when '← Zurück' is clicked", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    fireEvent.click(screen.getByText(/Zurück/));
    expect(screen.getByText("Wasser kochen.")).toBeInTheDocument();
  });

  it("disables '← Zurück' on the first step", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    expect(screen.getByText(/Zurück/)).toBeDisabled();
  });

  it("shows 'Fertig!' link on the last step", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    fireEvent.click(screen.getByText(/Weiter/));
    expect(screen.getByText("Fertig!")).toBeInTheDocument();
  });

  it("'Fertig!' link points back to the recipe", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    fireEvent.click(screen.getByText(/Weiter/));
    const link = screen.getByText("Fertig!").closest("a");
    expect(link).toHaveAttribute("href", "/cook-recipe");
  });
});

describe("CookMode — timer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows timer on a step with timerSeconds", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/)); // step 2 has timerSeconds: 480
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  it("does not show timer on a step without timerSeconds", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    // Step 1 has no timer
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  it("starts countdown when 'Start' is clicked", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/)); // step 2: 480s
    fireEvent.click(screen.getByText("Start"));

    // Advance one second at a time, wrapping each tick in act so React
    // flushes state updates before the next timeout is registered.
    act(() => { jest.advanceTimersByTime(1000); });
    act(() => { jest.advanceTimersByTime(1000); });
    act(() => { jest.advanceTimersByTime(1000); });

    expect(screen.getByText("07:57")).toBeInTheDocument();
  });

  it("toggles to 'Pause' while running", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByText("Pause")).toBeInTheDocument();
  });

  it("pauses when 'Pause' is clicked", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    fireEvent.click(screen.getByText("Start"));
    fireEvent.click(screen.getByText("Pause"));

    const displayedTime = screen.getByText("08:00").textContent;
    act(() => { jest.advanceTimersByTime(3000); });
    // Timer should not have advanced after pausing
    expect(screen.getByText(displayedTime!)).toBeInTheDocument();
  });

  it("resets timer when 'Reset' is clicked", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/));
    fireEvent.click(screen.getByText("Start"));
    act(() => { jest.advanceTimersByTime(5000); });
    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  it("resets timer when navigating to a new step", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Weiter/)); // step 2 with timer
    fireEvent.click(screen.getByText("Start"));
    act(() => { jest.advanceTimersByTime(5000); });

    fireEvent.click(screen.getByText(/Weiter/)); // step 3, no timer
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });
});

describe("CookMode — ingredients accordion", () => {
  it("hides ingredient list by default", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    expect(screen.queryByText("200 g")).not.toBeInTheDocument();
  });

  it("shows ingredients after clicking the accordion toggle", () => {
    // initialServings=1 so formatAmount(200, 1)=200g
    render(<CookMode recipe={makeRecipe()} initialServings={1} />);
    fireEvent.click(screen.getByText(/Zutaten für/));
    expect(screen.getByText("200 g")).toBeInTheDocument();
    expect(screen.getByText("Nudeln")).toBeInTheDocument();
  });

  it("hides ingredients again when accordion is toggled closed", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    fireEvent.click(screen.getByText(/Zutaten für/));
    fireEvent.click(screen.getByText(/Zutaten für/));
    expect(screen.queryByText("Nudeln")).not.toBeInTheDocument();
  });

  it("shows serving count in accordion label", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={3} />);
    expect(screen.getByText(/Zutaten für 3 Portionen/)).toBeInTheDocument();
  });

  it("uses singular 'Portion' for 1 serving", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={1} />);
    expect(screen.getByText(/Zutaten für 1 Portion$/)).toBeInTheDocument();
  });
});

describe("CookMode — recipe title display", () => {
  it("shows the recipe title in the header", () => {
    render(<CookMode recipe={makeRecipe()} initialServings={2} />);
    expect(screen.getByText("Pasta")).toBeInTheDocument();
  });
});
