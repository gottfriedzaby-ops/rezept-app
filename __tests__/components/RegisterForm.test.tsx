import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockSearchParams = jest.fn();
const signUp = jest.fn();
const signInWithOAuth = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
}));

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

jest.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signUp: (...args: unknown[]) => signUp(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
    },
  }),
}));

import RegisterPage from "@/app/register/page";

function fillRegistration(password = "longenough", confirm = "longenough") {
  fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
    target: { value: "newuser@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Passwort"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
    target: { value: confirm },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
}

beforeEach(() => {
  mockSearchParams.mockReset();
  signUp.mockReset();
  signInWithOAuth.mockReset();
  mockSearchParams.mockReturnValue(new URLSearchParams(""));
  // Component fetches invitation metadata in a useEffect when ?invitation= is set.
  // jsdom has no fetch — stub it to reject so the component falls through quietly.
  global.fetch = jest.fn().mockRejectedValue(new Error("no network")) as unknown as typeof fetch;
});

describe("RegisterForm (register page)", () => {
  // RF-01
  it("shows the 'Fast geschafft!' success screen on successful sign-up", async () => {
    signUp.mockResolvedValueOnce({ error: null });

    render(<RegisterPage />);
    fillRegistration();
    submit();

    expect(await screen.findByText("Fast geschafft!")).toBeInTheDocument();
    expect(
      screen.getByText(/bestätige deine E-Mail-Adresse/i)
    ).toBeInTheDocument();
  });

  // RF-02
  it("blocks submission with a German error when passwords do not match", () => {
    render(<RegisterPage />);
    fillRegistration("password1", "password2");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Passwörter stimmen nicht überein."
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  // RF-03
  it("blocks submission with a German error when the password is shorter than 8 chars", () => {
    render(<RegisterPage />);
    fillRegistration("short", "short");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Das Passwort muss mindestens 8 Zeichen lang sein."
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  // RF-04
  it("maps 'User already registered' to the duplicate-email message", async () => {
    signUp.mockResolvedValueOnce({ error: { message: "User already registered" } });

    render(<RegisterPage />);
    fillRegistration();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Diese E-Mail-Adresse ist bereits registriert."
    );
  });

  // RF-05
  it("maps 'Password should be' to the password-length message", async () => {
    signUp.mockResolvedValueOnce({
      error: { message: "Password should be at least 6 characters." },
    });

    render(<RegisterPage />);
    fillRegistration();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Das Passwort muss mindestens 8 Zeichen lang sein."
    );
  });

  // RF-06
  it("maps 'invalid email' to the invalid-email message", async () => {
    signUp.mockResolvedValueOnce({ error: { message: "invalid email format" } });

    render(<RegisterPage />);
    fillRegistration();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bitte gib eine gültige E-Mail-Adresse ein.");
  });

  // RF-07
  it("falls back to the generic error message on unknown server errors", async () => {
    signUp.mockResolvedValueOnce({ error: { message: "internal server failure" } });

    render(<RegisterPage />);
    fillRegistration();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Registrierung fehlgeschlagen. Bitte versuche es erneut."
    );
  });

  // RF-08
  it("disables the submit button and shows 'Registrieren …' while the request is pending", async () => {
    signUp.mockImplementation(() => new Promise(() => {}));

    render(<RegisterPage />);
    fillRegistration();
    submit();

    const loadingBtn = await screen.findByRole("button", { name: "Registrieren …" });
    expect(loadingBtn).toBeDisabled();
  });

  // RF-09
  it("Google OAuth button on the register page calls signInWithOAuth", async () => {
    signInWithOAuth.mockResolvedValueOnce({ error: null });

    render(<RegisterPage />);
    fireEvent.click(screen.getByRole("button", { name: /Mit Google anmelden/ }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const call = signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe("google");
    expect(call.options.redirectTo).toMatch(/\/auth\/callback$/);
  });

  it("includes the invitation token in the callback URL when ?invitation= is present", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("invitation=tok-123"));
    signUp.mockResolvedValueOnce({ error: null });

    render(<RegisterPage />);
    fillRegistration();
    submit();

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const call = signUp.mock.calls[0][0];
    expect(call.options.emailRedirectTo).toMatch(/[?&]invitation=tok-123/);
  });
});
