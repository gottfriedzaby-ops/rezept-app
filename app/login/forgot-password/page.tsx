"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "loading" | "success";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFormState("loading");

    const origin = window.location.origin;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${origin}/auth/reset-password` }
    );

    if (resetError) {
      setError("Anfrage fehlgeschlagen. Bitte versuche es erneut.");
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
            Passwort zurücksetzen
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Wir schicken dir einen Link zum Zurücksetzen deines Passworts.
          </p>
        </div>

        <div className="rounded-xl border border-stone bg-surface-primary shadow-sm p-6">
          {formState === "success" ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest-soft">
                <MailIcon />
              </div>
              <p className="text-sm text-ink-primary font-medium mb-1">
                E-Mail verschickt
              </p>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Wir haben dir einen Link zum Zurücksetzen deines Passworts
                geschickt.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-ink-secondary mb-1.5"
                >
                  E-Mail-Adresse
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="name@beispiel.de"
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
                {formState === "loading" ? "Senden …" : "Link anfordern"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-ink-secondary">
          <Link
            href="/login"
            className="font-medium text-forest hover:text-forest-deep transition-colors"
          >
            ← Zurück zur Anmeldung
          </Link>
        </p>

      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2D5F3F"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
