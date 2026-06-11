import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Postgres "relation does not exist" — migration 20260611000003 not applied.
const RELATION_MISSING = "42P01";

const MAX_ITEMS = 2000;
const TOMBSTONE_RETENTION_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let warnedMissingTable = false;

interface SyncItem {
  id: string;
  recipe_id: string;
  recipe_title: string;
  ingredient_name: string;
  amount: number | null;
  unit: string;
  checked: boolean;
  manual: boolean;
  added_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Whitelists and normalizes one client item; null = ignore it. */
function sanitizeItem(raw: unknown): SyncItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || !UUID_RE.test(item.id)) return null;
  if (typeof item.ingredient_name !== "string" || item.ingredient_name.length === 0) return null;
  if (!isIsoDate(item.added_at) || !isIsoDate(item.updated_at)) return null;

  return {
    id: item.id.toLowerCase(),
    recipe_id: typeof item.recipe_id === "string" ? item.recipe_id.slice(0, 200) : "manual",
    recipe_title: typeof item.recipe_title === "string" ? item.recipe_title.slice(0, 300) : "",
    ingredient_name: item.ingredient_name.slice(0, 300),
    amount: typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : null,
    unit: typeof item.unit === "string" ? item.unit.slice(0, 50) : "",
    checked: item.checked === true,
    manual: item.manual === true,
    added_at: item.added_at,
    updated_at: item.updated_at,
    deleted_at: isIsoDate(item.deleted_at) ? item.deleted_at : null,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawItems: unknown[] = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const clientItems = rawItems
    .map(sanitizeItem)
    .filter((item): item is SyncItem => item !== null);

  const { data: serverRows, error: selectError } = await supabaseAdmin
    .from("shopping_list_items")
    .select("id, updated_at")
    .eq("user_id", user.id);

  if (selectError) {
    if (selectError.code === RELATION_MISSING) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "[shopping-sync] Tabelle 'shopping_list_items' fehlt — Migration 20260611000003_shopping_list_sync.sql ausführen."
        );
      }
      return NextResponse.json(
        { data: null, error: "Sync noch nicht eingerichtet." },
        { status: 503 }
      );
    }
    return NextResponse.json({ data: null, error: selectError.message }, { status: 500 });
  }

  // Last-write-wins per item: only client rows that are newer than (or
  // unknown to) the server are written.
  const serverUpdatedById = new Map(
    (serverRows ?? []).map((row) => [row.id as string, row.updated_at as string])
  );
  const toUpsert = clientItems
    .filter((item) => {
      const serverUpdated = serverUpdatedById.get(item.id);
      return !serverUpdated || Date.parse(item.updated_at) > Date.parse(serverUpdated);
    })
    .map((item) => ({ ...item, user_id: user.id }));

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("shopping_list_items")
      .upsert(toUpsert, { onConflict: "user_id,id" });
    if (upsertError) {
      return NextResponse.json({ data: null, error: upsertError.message }, { status: 500 });
    }
  }

  // Drop tombstones every device has had a month to pick up.
  const purgeBefore = new Date(
    Date.now() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  await supabaseAdmin
    .from("shopping_list_items")
    .delete()
    .eq("user_id", user.id)
    .not("deleted_at", "is", null)
    .lt("deleted_at", purgeBefore);

  const { data: merged, error: mergedError } = await supabaseAdmin
    .from("shopping_list_items")
    .select("id, recipe_id, recipe_title, ingredient_name, amount, unit, checked, manual, added_at, updated_at, deleted_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: true });

  if (mergedError) {
    return NextResponse.json({ data: null, error: mergedError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { items: merged ?? [] }, error: null });
}
