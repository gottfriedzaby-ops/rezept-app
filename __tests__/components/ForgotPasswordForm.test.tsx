import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const resetPasswordForEmail = jest.fn();

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
      resetPasswordForEmail: (...args: unknown[]) =>
        resetPasswordForEmail(...args),
    },
  }),
}));

import ForgotPasswordPage from "@/app/login/forgot-password/page";

function fillEmail(email = "u@example.com") {
  fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
    target: { value: email },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Link anfordern" }));
}

beforeEach(() => {
  resetPasswordForEmail.mockReset();
});

describe("ForgotPasswordForm", () => {
  // FP-01
  it("shows the 'E-Mail verschickt' success screen on success", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null });

    render(<ForgotPasswordPage />);
    fillEmail();
    submit();

    expect(await screen.findByText("E-Mail verschickt")).toBeInTheDocument();
  });

  // FP-02
  it("shows a generic error message when the API fails", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "anything" },
    });

    render(<ForgotPasswordPage />);
    fillEmail();
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Anfrage fehlgeschlagen. Bitte versuche es erneut."
    );
  });

  // FP-03
  it("calls resetPasswordForEmail with a redirectTo ending in /auth/reset-password", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null });

    render(<ForgotPasswordPage />);
    fillEmail("alice@example.com");
    submit();

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));
    const [email, opts] = resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("alice@example.com");
    expect(opts.redirectTo).toMatch(/\/auth\/reset-password$/);
  });

  // FP-04
  it("disables the submit button and shows 'Senden …' while pending", async () => {
    resetPasswordForEmail.mockImplementation(() => new Promise(() => {}));

    render(<ForgotPasswordPage />);
    fillEmail();
    submit();

    const loadingBtn = await screen.findByRole("button", { name: "Senden …" });
    expect(loadingBtn).toBeDisabled();
  });
});
