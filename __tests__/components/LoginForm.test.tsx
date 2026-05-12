import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
const mockSearchParams = jest.fn();
const signInWithPassword = jest.fn();
const signInWithOAuth = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
    },
  }),
}));

import LoginPage from "@/app/login/page";

function fillCredentials(email = "u@example.com", password = "secret123") {
  fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Passwort"), {
    target: { value: password },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
}

beforeEach(() => {
  mockPush.mockReset();
  mockSearchParams.mockReset();
  signInWithPassword.mockReset();
  signInWithOAuth.mockReset();
  mockSearchParams.mockReturnValue(new URLSearchParams(""));
});

describe("LoginForm (login page)", () => {
  // LF-01
  it("redirects to / on successful sign-in with no ?redirect param", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });

    render(<LoginPage />);
    fillCredentials();
    submit();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  // LF-02
  it("redirects to the ?redirect target on successful sign-in", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("redirect=/recipes/abc"));
    signInWithPassword.mockResolvedValueOnce({ error: null });

    render(<LoginPage />);
    fillCredentials();
    submit();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/recipes/abc")
    );
  });

  // LF-03
  it("shows the wrong-password message on 'Invalid login credentials'", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);
    fillCredentials();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E-Mail-Adresse oder Passwort ist falsch.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  // LF-04
  it("shows the unconfirmed-email message on 'Email not confirmed'", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "Email not confirmed" },
    });

    render(<LoginPage />);
    fillCredentials();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bitte bestätige zuerst deine E-Mail-Adresse.");
  });

  // LF-05
  it("shows the rate-limit message on 'Too many requests'", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "Too many requests" },
    });

    render(<LoginPage />);
    fillCredentials();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Zu viele Versuche");
  });

  // LF-06
  it("shows the generic fallback message on an unknown error", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "completely unexpected server error" },
    });

    render(<LoginPage />);
    fillCredentials();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
  });

  // LF-07
  it("disables the submit button and shows 'Anmelden …' while the request is pending", async () => {
    signInWithPassword.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<LoginPage />);
    fillCredentials();
    submit();

    const loadingBtn = await screen.findByRole("button", { name: "Anmelden …" });
    expect(loadingBtn).toBeDisabled();
  });

  // LF-08
  it("Google OAuth button calls signInWithOAuth with provider:'google' and a /auth/callback redirectTo", async () => {
    signInWithOAuth.mockResolvedValueOnce({ error: null });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /Mit Google anmelden/ }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const call = signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe("google");
    expect(call.options.redirectTo).toMatch(/\/auth\/callback$/);
  });

  // LF-09
  it("shows the Google failure message when signInWithOAuth returns an error", async () => {
    signInWithOAuth.mockResolvedValueOnce({ error: { message: "oauth error" } });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /Mit Google anmelden/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
  });
});
