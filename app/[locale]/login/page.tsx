"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { useRouter, Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations('Login');
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
      setError(mapAuthError(signInError.message, t));
      setIsLoading(false);
      return;
    }

    router.push(redirect ?? "/");
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
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder={t('emailPlaceholder')}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-ink-secondary"
                >
                  {t('password')}
                </label>
                <Link
                  href="/login/forgot-password"
                  className="text-xs text-forest hover:text-forest-deep transition-colors"
                >
                  {t('forgotPassword')}
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
              {isLoading ? t('submitting') : t('submit')}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-secondary">
          {t('noAccount')}{" "}
          <Link
            href="/register"
            className="font-medium text-forest hover:text-forest-deep transition-colors"
          >
            {t('register')}
          </Link>
        </p>

      </div>
    </div>
  );
}

type TFunction = ReturnType<typeof useTranslations<'Login'>>;

function mapAuthError(message: string, t: TFunction): string {
  if (message.includes("Invalid login credentials")) {
    return t('errorInvalidCredentials');
  }
  if (message.includes("Email not confirmed")) {
    return t('errorEmailNotConfirmed');
  }
  if (message.includes("Too many requests")) {
    return t('errorTooManyRequests');
  }
  return t('errorGeneral');
}
