"use client";

import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useParams } from 'next/navigation';

export default function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher');
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentLocale = params.locale as string;

  function handleChange(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t('label')}>
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={locale === currentLocale}
          onClick={() => handleChange(locale)}
          className={`px-4 py-2 text-sm rounded border transition-colors ${
            locale === currentLocale
              ? "bg-ink-primary text-white border-ink-primary"
              : "bg-white text-ink-secondary border-stone hover:bg-surface-hover"
          }`}
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}
