import { supabaseAdmin } from "@/lib/supabase";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
}

// Postgres error code for "relation does not exist" — the profiles table
// migration (20260611000000_profiles.sql) has not been applied yet. All
// lookups fall back to the (slower) auth.admin API so the app keeps working.
const RELATION_MISSING = "42P01";

let warnedMissingTable = false;

function warnMissingTableOnce(): void {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(
    "[profiles] Tabelle 'profiles' fehlt — Migration 20260611000000_profiles.sql ausführen. Fallback auf auth.admin (langsam)."
  );
}

function displayNameFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  const name = metadata?.full_name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/** Batch-resolves user profiles by id. Unknown ids are simply absent from the map. */
export async function getProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const result = new Map<string, Profile>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", uniqueIds);

  if (!error && data) {
    for (const row of data as Profile[]) {
      result.set(row.id, row);
    }
    return result;
  }

  if (error && error.code !== RELATION_MISSING) {
    console.error("[profiles] getProfilesByIds failed:", error.message);
    return result;
  }

  warnMissingTableOnce();
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
        const user = userData?.user;
        if (user?.email) {
          result.set(id, {
            id,
            email: user.email.toLowerCase(),
            display_name: displayNameFromMetadata(user.user_metadata),
          });
        }
      } catch {
        // unknown/deleted user — leave absent
      }
    })
  );
  return result;
}

/** Resolves a user id by email (case-insensitive). Returns null when no account exists. */
export async function getProfileIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (!error) return (data as { id: string } | null)?.id ?? null;

  if (error.code !== RELATION_MISSING) {
    console.error("[profiles] getProfileIdByEmail failed:", error.message);
    return null;
  }

  warnMissingTableOnce();
  // Paginated scan over auth.users — unlike the previous single-page
  // listUsers() call, this still finds users beyond the first 50.
  const PER_PAGE = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data: pageData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (listError) {
      console.error("[profiles] listUsers fallback failed:", listError.message);
      return null;
    }
    const users = pageData?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return match.id;
    if (users.length < PER_PAGE) break;
  }
  return null;
}

/** Human-readable name for a profile: display name, else email, else the fallback. */
export function profileDisplayName(profile: Profile | undefined, fallback: string): string {
  if (!profile) return fallback;
  return profile.display_name || profile.email || fallback;
}
