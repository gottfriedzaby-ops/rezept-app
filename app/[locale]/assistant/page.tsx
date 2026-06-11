import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AssistantSuggest from "@/components/AssistantSuggest";
import UserNav from "@/components/UserNav";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/assistant");

  const [t, tCommon] = await Promise.all([
    getTranslations("Assistant"),
    getTranslations("Common"),
  ]);

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              {tCommon("allRecipes")}
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em]">
              {t("title")}
            </h1>
          </div>
          <UserNav />
        </header>

        <p className="text-sm text-ink-secondary mb-8">{t("intro")}</p>

        <AssistantSuggest />
      </div>
    </div>
  );
}
