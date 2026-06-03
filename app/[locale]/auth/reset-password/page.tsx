"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import { Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "loading" | "success";

export default function ResetPasswordPage() {
  const t = useTranslations('ResetPassword');
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

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

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(mapUpdateError(updateError.message, t));
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
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {t('subtitle')}
          </p>
        </div>

        <div className="rounded-xl border border-stone bg-surface-primary shadow-sm p-6">
          {formState === "success" ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest-soft">
                <CheckIcon />
              </div>
              <p className="text-sm text-ink-primary font-medium mb-1">
                {t('successTitle')}
              </p>
              <p className="text-sm text-ink-secondary leading-relaxed mb-5">
                {t('successMessage')}
              </p>
              <Link href="/" className="btn-primary inline-block">
                {t('goToRecipes')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-ink-secondary mb-1.5"
                >
                  {t('newPassword')}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label
                  htmlFor="password-confirm"
                  className="block text-xs font-medium text-ink-secondary mb-1.5"
                >
                  {t('confirmPassword')}
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

type TFunction = ReturnType<typeof useTranslations<'ResetPassword'>>;

function mapUpdateError(message: string, t: TFunction): string {
  if (message.includes("Password should be")) {
    return t('passwordTooShort');
  }
  if (message.includes("Auth session missing")) {
    return t('errorSessionMissing');
  }
  return t('errorGeneral');
}
