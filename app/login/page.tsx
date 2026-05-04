"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(mapAuthError(signInError.message));
      setIsLoading(false);
      return;
    }

    router.push(redirect ?? "/");
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

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-medium text-ink-primary tracking-[-0.02em]">
            Willkommen zurück
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Melde dich an, um deine Rezepte zu verwalten.
          </p>
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

          {/* Email/password form */}
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-ink-secondary"
                >
                  Passwort
                </label>
                <Link
                  href="/login/forgot-password"
                  className="text-xs text-forest hover:text-forest-deep transition-colors"
                >
                  Passwort vergessen?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? "Anmelden …" : "Anmelden"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-secondary">
          Noch kein Konto?{" "}
          <Link
            href="/register"
            className="font-medium text-forest hover:text-forest-deep transition-colors"
          >
            Registrieren
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

function mapAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "E-Mail-Adresse oder Passwort ist falsch.";
  }
  if (message.includes("Email not confirmed")) {
    return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  }
  if (message.includes("Too many requests")) {
    return "Zu viele Versuche. Bitte warte kurz und versuche es erneut.";
  }
  return "Anmeldung fehlgeschlagen. Bitte versuche es erneut.";
}
