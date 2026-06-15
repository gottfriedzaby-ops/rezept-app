import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import FastingDashboard from "@/components/fasting/FastingDashboard";
import UserNav from "@/components/UserNav";
import type { FastingSession } from "@/types/fasting";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const HISTORY_LIMIT = 30;

export default async function FastingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/fasting");

  const [t, tCommon] = await Promise.all([
    getTranslations("Fasting"),
    getTranslations("Common"),
  ]);

  const { data, error } = await supabaseAdmin
    .from("fasting_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(HISTORY_LIMIT + 1);

  if (error && error.code === RELATION_MISSING) {
    console.warn(
      "[fasting] Tabelle 'fasting_sessions' fehlt — Migration 20260615000001_feature19_fasting.sql ausführen."
    );
  }

  const sessions = (data ?? []) as FastingSession[];
  const active = sessions.find((s) => s.ended_at === null) ?? null;
  const history = sessions.filter((s) => s.ended_at !== null).slice(0, HISTORY_LIMIT);

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
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

        <FastingDashboard active={active} history={history} initialNow={Date.now()} />
      </div>
    </div>
  );
}
