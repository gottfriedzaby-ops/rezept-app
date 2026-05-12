import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const updateUser = jest.fn();

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
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
  }),
}));

import ResetPasswordPage from "@/app/auth/reset-password/page";

function fillPasswords(password = "longenough", confirm = "longenough") {
  fireEvent.change(screen.getByLabelText("Neues Passwort"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
    target: { value: confirm },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
}

beforeEach(() => {
  updateUser.mockReset();
});

describe("ResetPasswordForm", () => {
  // RP-01
  it("shows the 'Passwort geändert' success screen on success", async () => {
    updateUser.mockResolvedValueOnce({ error: null });

    render(<ResetPasswordPage />);
    fillPasswords();
    submit();

    expect(await screen.findByText("Passwort geändert")).toBeInTheDocument();
  });

  // RP-02
  it("blocks submission when passwords do not match (no updateUser call)", () => {
    render(<ResetPasswordPage />);
    fillPasswords("password1", "password2");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Passwörter stimmen nicht überein."
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  // RP-03
  it("blocks submission when the password is shorter than 8 chars", () => {
    render(<ResetPasswordPage />);
    fillPasswords("short", "short");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Das Passwort muss mindestens 8 Zeichen lang sein."
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  // RP-04
  it("maps 'Auth session missing' to the expired-session message", async () => {
    updateUser.mockResolvedValueOnce({
      error: { message: "Auth session missing" },
    });

    render(<ResetPasswordPage />);
    fillPasswords();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Link an."
    );
  });

  // RP-05
  it("falls back to the generic error message on unknown failures", async () => {
    updateUser.mockResolvedValueOnce({
      error: { message: "something completely unexpected" },
    });

    render(<ResetPasswordPage />);
    fillPasswords();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Passwort konnte nicht geändert werden. Bitte versuche es erneut."
    );
  });

  it("maps 'Password should be' to the password-length message", async () => {
    updateUser.mockResolvedValueOnce({
      error: { message: "Password should be at least 6 characters" },
    });

    render(<ResetPasswordPage />);
    fillPasswords();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Das Passwort muss mindestens 8 Zeichen lang sein."
    );
  });
});
