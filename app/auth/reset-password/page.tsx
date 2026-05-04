"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "loading" | "success";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setFormState("loading");

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(mapUpdateError(updateError.message));
      setFormState("idle");
      return;
    }

    setFormState("success");
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-medium text-ink-primary tracking-[-0.02em]">
            Neues Passwort
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Wähle ein neues Passwort für dein Konto.
          </p>
        </div>

        <div className="rounded-xl border border-stone bg-surface-primary shadow-sm p-6">
          {formState === "success" ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest-soft">
                <CheckIcon />
              </div>
              <p className="text-sm text-ink-primary font-medium mb-1">
                Passwort geändert
              </p>
              <p className="text-sm text-ink-secondary leading-relaxed mb-5">
                Dein Passwort wurde erfolgreich geändert.
              </p>
              <Link href="/" className="btn-primary inline-block">
                Zu meinen Rezepten
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-ink-secondary mb-1.5"
                >
                  Neues Passwort
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="Mindestens 8 Zeichen"
                />
              </div>

              <div>
                <label
                  htmlFor="password-confirm"
                  className="block text-xs font-medium text-ink-secondary mb-1.5"
                >
                  Passwort bestätigen
                </label>
                <input
                  id="password-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={formState === "loading"}
                className="btn-primary w-full"
              >
                {formState === "loading"
                  ? "Speichern …"
                  : "Passwort speichern"}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2D5F3F"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function mapUpdateError(message: string): string {
  if (message.includes("Password should be")) {
    return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  }
  if (message.includes("Auth session missing")) {
    return "Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Link an.";
  }
  return "Passwort konnte nicht geändert werden. Bitte versuche es erneut.";
}
