import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

function Trigger({ message }: { message: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      Zeigen
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a toast in a polite live region and auto-dismisses it after 3s", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger message="Zur Einkaufsliste hinzugefügt" />
      </ToastProvider>
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zeigen" }));

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Zur Einkaufsliste hinzugefügt");

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stacks multiple toasts and dismisses them independently", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger message="Erster Toast" />
      </ToastProvider>
    );

    await user.click(screen.getByRole("button", { name: "Zeigen" }));
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    await user.click(screen.getByRole("button", { name: "Zeigen" }));

    expect(screen.getAllByText("Erster Toast")).toHaveLength(2);

    // First toast expires, second is still visible
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getAllByText("Erster Toast")).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.queryByText("Erster Toast")).not.toBeInTheDocument();
  });

  it("throws when useToast is used outside the provider", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger message="x" />)).toThrow(
      "useToast must be used within a ToastProvider"
    );
    consoleError.mockRestore();
  });
});
