import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnalyticsToggle from "@/components/AnalyticsToggle";

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AnalyticsToggle", () => {
  it("reflects the initial consent value", () => {
    const { unmount } = render(<AnalyticsToggle initialValue={true} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    unmount();
    render(<AnalyticsToggle initialValue={false} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("PATCHes analytics_enabled and dispatches the live consent event on opt-out", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const dispatchSpy = jest.spyOn(window, "dispatchEvent");

    render(<AnalyticsToggle initialValue={true} />);
    await user.click(screen.getByRole("switch"));

    expect(global.fetch).toHaveBeenCalledWith("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analytics_enabled: false }),
    });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    await waitFor(() => {
      const call = dispatchSpy.mock.calls.find(
        ([e]) => (e as Event).type === "analytics:consent-changed",
      );
      expect(call).toBeTruthy();
      expect((call![0] as CustomEvent<{ enabled: boolean }>).detail).toEqual({
        enabled: false,
      });
    });
  });

  it("reverts and shows an error when the request fails", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    render(<AnalyticsToggle initialValue={true} />);
    await user.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });
    expect(
      screen.getByText("Einstellung konnte nicht gespeichert werden."),
    ).toBeInTheDocument();
  });
});
