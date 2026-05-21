"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "loading" | "success";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const t = useTranslations('Register');
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
      setError(t('passwordMismatch'));
      return;
    }

    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }

    setFormState("loading");
    const origin = window.location.origin;

    // Invite-only gate: ask the server whether this email is on the allowlist
    // before we hit Supabase. Skipped server-side when INVITE_ONLY_REGISTRATION
    // is "false", so the response is always allowed in that mode.
    try {
      const preflight = await fetch("/api/auth/preflight-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const preflightJson = await preflight.json().catch(() => ({}));
      if (!preflight.ok) {
        setError(
          (preflightJson?.error as string | undefined) ?? t('errorNotPossible'),
        );
        setFormState("idle");
        return;
      }
    } catch {
      setError(t('errorNotPossible'));
      setFormState("idle");
      return;
    }

    const callbackUrl = invitationToken
      ? `${origin}/auth/callback?invitation=${invitationToken}`
      : `${origin}/auth/callback`;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl },
    });

    if (signUpError) {
      setError(mapAuthError(signUpError.message, t));
      setFormState("idle");
      return;
    }

    setFormState("success");
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
              {t('successTitle')}
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {t('successMessage')}
            </p>
          </div>
          <p className="mt-5 text-sm text-ink-secondary">
            {t('alreadyConfirmed')}{" "}
            <Link
              href="/login"
              className="font-medium text-forest hover:text-forest-deep transition-colors"
            >
              {t('loginNow')}
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
            {t('title')}
          </h1>
          {invitationOwnerName ? (
            <p className="mt-2 text-sm text-ink-secondary">
              {t('invitedSubtitle', { name: invitationOwnerName })}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-secondary">
              {t('subtitle')}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-stone bg-surface-primary shadow-sm p-6">

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-ink-secondary mb-1.5"
              >
                {t('email')}
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
                placeholder={t('emailPlaceholder')}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-ink-secondary mb-1.5"
              >
                {t('password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder={t('passwordPlaceholder')}
              />
            </div>

            <div>
              <label
                htmlFor="password-confirm"
                className="block text-xs font-medium text-ink-secondary mb-1.5"
              >
                {t('passwordConfirm')}
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
              {formState === "loading" ? t('submitting') : t('submit')}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-secondary">
          {t('hasAccount')}{" "}
          <Link
            href="/login"
            className="font-medium text-forest hover:text-forest-deep transition-colors"
          >
            {t('login')}
          </Link>
        </p>

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

type TFunction = ReturnType<typeof useTranslations<'Register'>>;

function mapAuthError(message: string, t: TFunction): string {
  if (message.includes("User already registered")) {
    return t('errorAlreadyRegistered');
  }
  if (message.includes("Password should be")) {
    return t('errorPasswordTooShort');
  }
  if (message.includes("invalid email")) {
    return t('errorInvalidEmail');
  }
  if (message.includes("Too many requests")) {
    return t('errorTooManyRequests');
  }
  return t('errorGeneral');
}
