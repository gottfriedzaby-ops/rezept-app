import { render, screen, act } from "@testing-library/react";
import FastingTimer from "@/components/fasting/FastingTimer";
import type { FastingSession } from "@/types/fasting";

function makeSession(overrides: Partial<FastingSession> = {}): FastingSession {
  return {
    id: "s1",
    created_at: "2026-06-15T08:00:00.000Z",
    updated_at: "2026-06-15T08:00:00.000Z",
    user_id: "u1",
    started_at: "2026-06-15T08:00:00.000Z",
    ended_at: null,
    target_hours: 16,
    preset: "16:8",
    ...overrides,
  };
}

describe("FastingTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-15T16:00:00.000Z")); // 8h into a 16h fast
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the elapsed clock for the active fast", () => {
    render(<FastingTimer session={makeSession()} initialNow={Date.parse("2026-06-15T16:00:00.000Z")} />);
    expect(screen.getByText("8:00:00")).toBeInTheDocument();
  });

  it("ticks the clock forward every second", () => {
    render(<FastingTimer session={makeSession()} initialNow={Date.parse("2026-06-15T16:00:00.000Z")} />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("8:00:02")).toBeInTheDocument();
  });

  it("shows the goal-reached state once the target is met", () => {
    jest.setSystemTime(new Date("2026-06-16T00:00:00.000Z")); // exactly 16h
    render(<FastingTimer session={makeSession()} initialNow={Date.parse("2026-06-16T00:00:00.000Z")} />);
    expect(screen.getByText(/Ziel erreicht/)).toBeInTheDocument();
  });
});
