import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WhatsNewPopup from "@/components/WhatsNewPopup";
import { APP_VERSION, LAST_SEEN_VERSION_KEY } from "@/lib/changelog";

// Mutable auth stub — the `mock` prefix lets jest.mock reference it.
let mockAuth: { user: { id: string } | null; loading: boolean } = {
  user: { id: "u1" },
  loading: false,
};

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  localStorage.clear();
  mockAuth = { user: { id: "u1" }, loading: false };
});

describe("WhatsNewPopup", () => {
  it("shows the latest release once on first visit and records the version", async () => {
    const user = userEvent.setup();
    render(<WhatsNewPopup />);

    // German messages back the test intl mock.
    expect(
      await screen.findByText("Versionshinweise & Feinschliff")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Verstanden" }));

    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
    expect(
      screen.queryByText("Versionshinweise & Feinschliff")
    ).not.toBeInTheDocument();
  });

  it("stays hidden when the user is already on the current version", () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    render(<WhatsNewPopup />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
  });

  it("cumulates every release missed since the last seen version", async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, "1.1.0");
    render(<WhatsNewPopup />);

    // 1.4.0, 1.3.0 and 1.2.0 are all newer than 1.1.0.
    expect(
      await screen.findByText("Versionshinweise & Feinschliff")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Intervallfasten & Foto-Nährwerte")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ernährungstagebuch & Tagesziele")
    ).toBeInTheDocument();
    // 1.1.0 itself was already seen → not shown.
    expect(
      screen.queryByText("Sammlungen & KI-Kochassistent")
    ).not.toBeInTheDocument();
  });

  it("renders nothing for signed-out or still-loading sessions", () => {
    mockAuth = { user: null, loading: false };
    const { rerender } = render(<WhatsNewPopup />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    mockAuth = { user: null, loading: true };
    rerender(<WhatsNewPopup />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
