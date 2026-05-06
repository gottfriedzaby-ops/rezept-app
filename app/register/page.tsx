"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "loading" | "success";

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("invitation");

  const [email, setEmail] = useState("");
  const [emailReadOnly, setEmailReadOnly] = useState(false);
  const [invitationOwnerName, setInvitationOwnerName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (!invitationToken) return;
    fetch(`/api/library-shares/invitation/${invitationToken}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          setEmail(json.data.recipient_email);
          setEmailReadOnly(true);
          setInvitationOwnerName(json.data.owner_display_name);
        }
      })
      .catch(() => {});
  }, [invitationToken]);

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
    const origin = window.location.origin;

    const callbackUrl = invitationToken
      ? `${origin}/auth/callback?invitation=${invitationToken}`
      : `${origin}/auth/callback`;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl },
    });

    if (signUpError) {
      setError(mapAuthError(signUpError.message));
      setFormState("idle");
      return;
    }

    setFormState("success");
  }

  async function handleGoogleSignIn() {
    setError(null);
    const origin = window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (oauthError) {
      setError("Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
    }
  }

  if (formState === "success") {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-xl border border-stone bg-surface-primary shadow-sm p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest-soft">
              <CheckIcon />
            </div>
            <h2 className="font-serif text-xl font-medium text-ink-primary mb-2">
              Fast geschafft!
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Bitte bestätige deine E-Mail-Adresse. Wir haben dir eine E-Mail
              geschickt.
            </p>
          </div>
          <p className="mt-5 text-sm text-ink-secondary">
            Bereits bestätigt?{" "}
            <Link
              href="/login"
              className="font-medium text-forest hover:text-forest-deep transition-colors"
            >
              Jetzt anmelden
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-medium text-ink-primary tracking-[-0.02em]">
            Konto erstellen
          </h1>
          {invitationOwnerName ? (
            <p className="mt-2 text-sm text-ink-secondary">
              Du wurdest von{" "}
              <span className="font-medium text-ink-primary">{invitationOwnerName}</span>{" "}
              eingeladen, ihre/seine Rezeptsammlung anzusehen.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-secondary">
              Speichere und verwalte deine Lieblingsrezepte.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-stone bg-surface-primary shadow-sm p-6">

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 rounded border border-stone bg-white px-4 py-2.5 text-sm font-medium text-ink-primary hover:bg-surface-hover transition-colors"
          >
            <GoogleIcon />
            Mit Google anmelden
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t border-stone" />
            <span className="text-xs text-ink-tertiary">oder</span>
            <div className="flex-1 border-t border-stone" />
          </div>

          {/* Registration form */}
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
                onChange={(e) => !emailReadOnly && setEmail(e.target.value)}
                readOnly={emailReadOnly}
                className={`input-field${emailReadOnly ? " bg-surface-secondary cursor-not-allowed" : ""}`}
                placeholder="name@beispiel.de"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-ink-secondary mb-1.5"
              >
                Passwort
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
              {formState === "loading" ? "Registrieren …" : "Registrieren"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-secondary">
          Bereits registriert?{" "}
          <Link
            href="/login"
            className="font-medium text-forest hover:text-forest-deep transition-colors"
          >
            Anmelden
          </Link>
        </p>

      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
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

function mapAuthError(message: string): string {
  if (message.includes("User already registered")) {
    return "Diese E-Mail-Adresse ist bereits registriert.";
  }
  if (message.includes("Password should be")) {
    return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  }
  if (message.includes("invalid email")) {
    return "Bitte gib eine gültige E-Mail-Adresse ein.";
  }
  if (message.includes("Too many requests")) {
    return "Zu viele Versuche. Bitte warte kurz und versuche es erneut.";
  }
  return "Registrierung fehlgeschlagen. Bitte versuche es erneut.";
}
