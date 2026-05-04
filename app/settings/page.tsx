import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import ShareManager from "@/components/ShareManager";
import UserSettingsActions from "@/components/UserSettingsActions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: shares } = await supabaseAdmin
    .from("shares")
    .select("id, created_at, token, label, revoked_at")
    .eq("owner_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-16">
        <a
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Alle Rezepte
        </a>

        <h1 className="font-serif text-4xl font-medium text-ink-primary tracking-[-0.02em] mb-10">
          Einstellungen
        </h1>

        {/* Account info */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Konto
          </h2>
          <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
            <p className="text-sm text-ink-secondary">
              Angemeldet als <span className="text-ink-primary font-medium">{user.email}</span>
            </p>
            <UserSettingsActions />
          </div>
        </section>

        {/* Share links */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Geteilte Links
          </h2>
          <ShareManager initialShares={shares ?? []} />
        </section>
      </div>
    </div>
  );
}
