import { supabaseAdmin } from "@/lib/supabase";
import { computeCostUsd } from "@/lib/claude-pricing";
import { EVENT_CATEGORY } from "@/lib/analytics-events";

export type WindowKey = "24h" | "7d" | "30d" | "all";

const WINDOW_MS: Record<WindowKey, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: null,
};

export function isValidWindow(s: unknown): s is WindowKey {
  return s === "24h" || s === "7d" || s === "30d" || s === "all";
}

export function parseWindow(value: string | null | undefined): WindowKey {
  return isValidWindow(value) ? value : "7d";
}

export function windowStart(window: WindowKey): Date {
  const ms = WINDOW_MS[window];
  return ms === null ? new Date(0) : new Date(Date.now() - ms);
}

export interface ClaudeCallRow {
  user_id: string | null;
  function: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  duration_ms: number;
  status: "success" | "error";
}

export interface DashboardMetrics {
  window: WindowKey;
  windowStart: string;
  generatedAt: string;
  userActivity: {
    totalRegisteredUsers: number;
    newUsersInWindow: number;
    activeUsersInWindow: number;
    recipesCreatedInWindow: number;
  };
  recipeUsage: {
    bySourceType: Array<{ source_type: string; count: number; percentage: number }>;
    topTags: Array<{ tag: string; count: number }>;
    totalActiveShares: number;
  };
  apiUsage: {
    callsByFunction: Array<{
      function: string;
      count: number;
      percentage: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
    }>;
    successCount: number;
    errorCount: number;
    uniqueUsersWithCalls: number;
    totalCalls: number;
  };
  cost: {
    totalUsd: number;
    breakdown: Array<{
      function: string;
      model: string;
      cost_usd: number | null;
    }>;
    unpricedModelCalls: number;
  };
}

// ---------------------------------------------------------------------------
// Per-user row for the dashboard table
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string;
  registered_at: string;
  last_sign_in_at: string | null;
  is_disabled: boolean;
  recipes_lifetime: number;
  api_calls_in_window: number;
  cost_usd_in_window: number;
}

export interface AdminUserDetail extends AdminUserRow {
  recipes_in_window: number;
  recipes_by_source_in_window: Array<{ source_type: string; count: number }>;
  api_by_function_and_model_in_window: Array<{
    function: string;
    model: string;
    count: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    cost_usd: number | null;
  }>;
  cost_breakdown_in_window: Array<{
    function: string;
    model: string;
    cost_usd: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Auth user listing — abstracted so the dashboard never assumes the size of
// the user base
// ---------------------------------------------------------------------------

interface AuthUserLite {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
}

async function listAuthUsers(): Promise<AuthUserLite[]> {
  const users: AuthUserLite[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until: (u as { banned_until?: string | null }).banned_until ?? null,
      });
    }
    if (data.users.length < perPage) break;
    page++;
    if (page > 50) break;
  }
  return users;
}

function isBannedNow(banned_until: string | null): boolean {
  if (!banned_until) return false;
  return new Date(banned_until).getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

export async function fetchDashboardMetrics(
  window: WindowKey,
): Promise<DashboardMetrics> {
  const start = windowStart(window);
  const startIso = start.toISOString();

  const [
    users,
    recipesInWindowResp,
    sharesResp,
    callsInWindowResp,
  ] = await Promise.all([
    listAuthUsers(),
    supabaseAdmin
      .from("recipes")
      .select("source_type, tags, created_at")
      .gte("created_at", startIso),
    supabaseAdmin
      .from("shares")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null),
    supabaseAdmin
      .from("claude_api_calls")
      .select(
        "user_id, function, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, duration_ms, status",
      )
      .gte("created_at", startIso),
  ]);

  const recipesInWindow = (recipesInWindowResp.data ?? []) as Array<{
    source_type: string;
    tags: string[] | null;
    created_at: string;
  }>;
  const calls = (callsInWindowResp.data ?? []) as ClaudeCallRow[];

  // User activity
  const totalRegisteredUsers = users.length;
  const newUsersInWindow = users.filter(
    (u) => new Date(u.created_at) >= start,
  ).length;
  const activeUsersInWindow = users.filter(
    (u) => u.last_sign_in_at !== null && new Date(u.last_sign_in_at) >= start,
  ).length;
  const recipesCreatedInWindow = recipesInWindow.length;

  // Recipe breakdown
  const sourceCounts = new Map<string, number>();
  for (const r of recipesInWindow) {
    sourceCounts.set(r.source_type, (sourceCounts.get(r.source_type) ?? 0) + 1);
  }
  const recipesTotal = recipesInWindow.length || 1;
  const bySourceType = Array.from(sourceCounts.entries())
    .map(([source_type, count]) => ({
      source_type,
      count,
      percentage: (count / recipesTotal) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  const tagCounts = new Map<string, number>();
  for (const r of recipesInWindow) {
    for (const t of r.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // API usage by function
  const callsTotal = calls.length || 1;
  const byFnAgg = new Map<
    string,
    {
      count: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
    }
  >();
  for (const c of calls) {
    const agg = byFnAgg.get(c.function) ?? {
      count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    };
    agg.count++;
    agg.input_tokens += c.input_tokens;
    agg.output_tokens += c.output_tokens;
    agg.cache_read_tokens += c.cache_read_tokens ?? 0;
    agg.cache_creation_tokens += c.cache_creation_tokens ?? 0;
    byFnAgg.set(c.function, agg);
  }
  const callsByFunction = Array.from(byFnAgg.entries())
    .map(([fn, agg]) => ({ function: fn, percentage: (agg.count / callsTotal) * 100, ...agg }))
    .sort((a, b) => b.count - a.count);

  const successCount = calls.filter((c) => c.status === "success").length;
  const errorCount = calls.filter((c) => c.status === "error").length;
  const uniqueUsersWithCalls = new Set(
    calls.map((c) => c.user_id).filter((u): u is string => u !== null),
  ).size;

  // Cost — aggregate by (function, model)
  const costByFnModel = new Map<
    string,
    { function: string; model: string; cost_usd: number | null }
  >();
  let totalUsd = 0;
  let unpricedModelCalls = 0;
  for (const c of calls) {
    const key = `${c.function}::${c.model}`;
    const callCost = computeCostUsd(c.model, {
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_read_tokens: c.cache_read_tokens,
      cache_creation_tokens: c.cache_creation_tokens,
    });
    const existing = costByFnModel.get(key);
    if (callCost === null) {
      unpricedModelCalls++;
      if (!existing) costByFnModel.set(key, { function: c.function, model: c.model, cost_usd: null });
    } else {
      totalUsd += callCost;
      if (!existing) {
        costByFnModel.set(key, { function: c.function, model: c.model, cost_usd: callCost });
      } else if (existing.cost_usd !== null) {
        existing.cost_usd += callCost;
      }
    }
  }

  return {
    window,
    windowStart: startIso,
    generatedAt: new Date().toISOString(),
    userActivity: {
      totalRegisteredUsers,
      newUsersInWindow,
      activeUsersInWindow,
      recipesCreatedInWindow,
    },
    recipeUsage: {
      bySourceType,
      topTags,
      totalActiveShares: sharesResp.count ?? 0,
    },
    apiUsage: {
      callsByFunction,
      successCount,
      errorCount,
      uniqueUsersWithCalls,
      totalCalls: calls.length,
    },
    cost: {
      totalUsd,
      breakdown: Array.from(costByFnModel.values()).sort((a, b) =>
        (b.cost_usd ?? 0) - (a.cost_usd ?? 0),
      ),
      unpricedModelCalls,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-user table
// ---------------------------------------------------------------------------

export async function fetchAdminUserTable(
  window: WindowKey,
): Promise<AdminUserRow[]> {
  const start = windowStart(window);
  const startIso = start.toISOString();

  const [users, recipeCounts, callsInWindow] = await Promise.all([
    listAuthUsers(),
    // Lifetime recipe count per user, computed in JS from a `user_id` projection.
    supabaseAdmin.from("recipes").select("user_id"),
    supabaseAdmin
      .from("claude_api_calls")
      .select("user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens")
      .gte("created_at", startIso),
  ]);

  const recipesPerUser = new Map<string, number>();
  for (const r of (recipeCounts.data ?? []) as Array<{ user_id: string | null }>) {
    if (!r.user_id) continue;
    recipesPerUser.set(r.user_id, (recipesPerUser.get(r.user_id) ?? 0) + 1);
  }

  const callsPerUser = new Map<string, { count: number; cost: number }>();
  for (const c of (callsInWindow.data ?? []) as ClaudeCallRow[]) {
    if (!c.user_id) continue;
    const agg = callsPerUser.get(c.user_id) ?? { count: 0, cost: 0 };
    agg.count++;
    const cost = computeCostUsd(c.model, {
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_read_tokens: c.cache_read_tokens,
      cache_creation_tokens: c.cache_creation_tokens,
    });
    if (cost !== null) agg.cost += cost;
    callsPerUser.set(c.user_id, agg);
  }

  return users
    .map((u): AdminUserRow => {
      const calls = callsPerUser.get(u.id) ?? { count: 0, cost: 0 };
      return {
        id: u.id,
        email: u.email,
        registered_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        is_disabled: isBannedNow(u.banned_until),
        recipes_lifetime: recipesPerUser.get(u.id) ?? 0,
        api_calls_in_window: calls.count,
        cost_usd_in_window: calls.cost,
      };
    })
    .sort((a, b) => b.cost_usd_in_window - a.cost_usd_in_window);
}

// ---------------------------------------------------------------------------
// Per-user detail
// ---------------------------------------------------------------------------

export async function fetchAdminUserDetail(
  userId: string,
  window: WindowKey,
): Promise<AdminUserDetail | null> {
  const start = windowStart(window);
  const startIso = start.toISOString();

  const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userResult?.user) return null;
  const u = userResult.user;

  const [recipeAll, recipesInWindowResp, calls] = await Promise.all([
    supabaseAdmin.from("recipes").select("id").eq("user_id", userId),
    supabaseAdmin
      .from("recipes")
      .select("source_type")
      .eq("user_id", userId)
      .gte("created_at", startIso),
    supabaseAdmin
      .from("claude_api_calls")
      .select("function, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, duration_ms, status")
      .eq("user_id", userId)
      .gte("created_at", startIso),
  ]);

  const recipesLifetime = (recipeAll.data ?? []).length;
  const recipesInWindow = (recipesInWindowResp.data ?? []) as Array<{ source_type: string }>;
  const sourceCounts = new Map<string, number>();
  for (const r of recipesInWindow) {
    sourceCounts.set(r.source_type, (sourceCounts.get(r.source_type) ?? 0) + 1);
  }
  const recipesBySource = Array.from(sourceCounts.entries())
    .map(([source_type, count]) => ({ source_type, count }))
    .sort((a, b) => b.count - a.count);

  type ApiRow = Omit<ClaudeCallRow, "user_id">;
  const apiCalls = (calls.data ?? []) as ApiRow[];
  const byFnModel = new Map<
    string,
    {
      function: string;
      model: string;
      count: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
      cost_usd: number | null;
      hasUnpriced: boolean;
    }
  >();
  let userCost = 0;
  for (const c of apiCalls) {
    const key = `${c.function}::${c.model}`;
    const agg = byFnModel.get(key) ?? {
      function: c.function,
      model: c.model,
      count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      cost_usd: 0,
      hasUnpriced: false,
    };
    agg.count++;
    agg.input_tokens += c.input_tokens;
    agg.output_tokens += c.output_tokens;
    agg.cache_read_tokens += c.cache_read_tokens ?? 0;
    agg.cache_creation_tokens += c.cache_creation_tokens ?? 0;
    const cost = computeCostUsd(c.model, {
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_read_tokens: c.cache_read_tokens,
      cache_creation_tokens: c.cache_creation_tokens,
    });
    if (cost === null) {
      agg.hasUnpriced = true;
    } else if (agg.cost_usd !== null) {
      agg.cost_usd += cost;
      userCost += cost;
    }
    byFnModel.set(key, agg);
  }

  const apiByFnModel = Array.from(byFnModel.values()).map((a) => ({
    function: a.function,
    model: a.model,
    count: a.count,
    input_tokens: a.input_tokens,
    output_tokens: a.output_tokens,
    cache_read_tokens: a.cache_read_tokens,
    cache_creation_tokens: a.cache_creation_tokens,
    cost_usd: a.hasUnpriced && a.cost_usd === 0 ? null : a.cost_usd,
  }));

  const costBreakdown = apiByFnModel.map((a) => ({
    function: a.function,
    model: a.model,
    cost_usd: a.cost_usd,
  }));

  return {
    id: u.id,
    email: u.email ?? "",
    registered_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    is_disabled: isBannedNow((u as { banned_until?: string | null }).banned_until ?? null),
    recipes_lifetime: recipesLifetime,
    api_calls_in_window: apiCalls.length,
    cost_usd_in_window: userCost,
    recipes_in_window: recipesInWindow.length,
    recipes_by_source_in_window: recipesBySource,
    api_by_function_and_model_in_window: apiByFnModel,
    cost_breakdown_in_window: costBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Interaction analytics (Feature 20) — aggregated in Postgres via RPCs over the
// high-volume `interaction_events` table. Degrades gracefully to an empty
// object while the migration has not yet been applied.
// ---------------------------------------------------------------------------

export interface FunnelStep {
  key: string;
  count: number;
}
export interface FunnelResult {
  steps: FunnelStep[];
  conversionPct: number | null;
}

export interface InteractionMetrics {
  window: WindowKey;
  windowStart: string;
  generatedAt: string;
  totals: { totalEvents: number; activeUsers: number; eventsPerUser: number };
  byName: Array<{ name: string; count: number; percentage: number }>;
  byCategory: Array<{ category: string; count: number; percentage: number }>;
  topPages: Array<{ path: string; count: number }>;
  timeSeries: Array<{ date: string; count: number }>; // dense UTC daily buckets, ascending
  funnels: { import: FunnelResult; cook: FunnelResult };
}

// Shapes of the RPC result rows (bigint counts may arrive as string → Number()).
interface EventCountRow {
  name: string;
  count: number;
}
interface DailyCountRow {
  day: string;
  count: number;
}
interface TopPageRow {
  path: string;
  count: number;
}

// Funnel definitions — keys mirror the analytics taxonomy; the UI localises them.
const IMPORT_FUNNEL_KEYS = [
  "recipe_import_started",
  "recipe_import_review",
  "recipe_imported",
] as const;
const COOK_FUNNEL_KEYS = ["cook_started", "cook_completed"] as const;

function buildFunnel(
  keys: readonly string[],
  countByName: Map<string, number>,
): FunnelResult {
  const steps: FunnelStep[] = keys.map((key) => ({
    key,
    count: countByName.get(key) ?? 0,
  }));
  const first = steps[0]?.count ?? 0;
  const last = steps[steps.length - 1]?.count ?? 0;
  return {
    steps,
    conversionPct: first > 0 ? (last / first) * 100 : null,
  };
}

// A `YYYY-MM-DD` key from a Date in UTC.
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptyInteractionMetrics(
  window: WindowKey,
  startIso: string,
): InteractionMetrics {
  const emptyCounts = new Map<string, number>();
  return {
    window,
    windowStart: startIso,
    generatedAt: new Date().toISOString(),
    totals: { totalEvents: 0, activeUsers: 0, eventsPerUser: 0 },
    byName: [],
    byCategory: [],
    topPages: [],
    timeSeries: [],
    funnels: {
      import: buildFunnel(IMPORT_FUNNEL_KEYS, emptyCounts),
      cook: buildFunnel(COOK_FUNNEL_KEYS, emptyCounts),
    },
  };
}

export async function fetchInteractionMetrics(
  window: WindowKey,
): Promise<InteractionMetrics> {
  const startIso = windowStart(window).toISOString();

  const [countsResp, dailyResp, pagesResp, activeResp] = await Promise.all([
    supabaseAdmin.rpc("analytics_event_counts", { p_start: startIso }),
    supabaseAdmin.rpc("analytics_daily_counts", { p_start: startIso }),
    supabaseAdmin.rpc("analytics_top_pages", { p_start: startIso, p_limit: 10 }),
    supabaseAdmin.rpc("analytics_active_users", { p_start: startIso }),
  ]);

  // Graceful degradation: if the analytics schema is not yet present, return an
  // empty object instead of throwing so the dashboard still renders.
  const primaryError = countsResp.error;
  if (primaryError) {
    const code = primaryError.code;
    if (
      code === "42P01" ||
      code === "PGRST202" ||
      (primaryError.message ?? "").includes("does not exist")
    ) {
      return emptyInteractionMetrics(window, startIso);
    }
    throw primaryError;
  }
  // Any other RPC failing (schema exists but query broke) is a real 500.
  if (dailyResp.error) throw dailyResp.error;
  if (pagesResp.error) throw pagesResp.error;
  if (activeResp.error) throw activeResp.error;

  // ── Events by name ────────────────────────────────────────────────────────
  const countRows = (countsResp.data ?? []) as EventCountRow[];
  const byNameRaw = countRows
    .map((r) => ({ name: r.name, count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);
  const totalEvents = byNameRaw.reduce((sum, r) => sum + r.count, 0);
  const byName = byNameRaw.map((r) => ({
    name: r.name,
    count: r.count,
    percentage: totalEvents ? (r.count / totalEvents) * 100 : 0,
  }));

  const countByName = new Map<string, number>();
  for (const r of byNameRaw) countByName.set(r.name, r.count);

  // ── Events by category (folded from names server-side) ────────────────────
  const categoryOf = EVENT_CATEGORY as Record<string, string>;
  const categoryCounts = new Map<string, number>();
  for (const r of byNameRaw) {
    const category = categoryOf[r.name] ?? "navigation";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + r.count);
  }
  const byCategory = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalEvents ? (count / totalEvents) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Active users + events per user ────────────────────────────────────────
  const activeUsers = Number(activeResp.data ?? 0);
  const eventsPerUser = activeUsers > 0 ? totalEvents / activeUsers : 0;

  // ── Top pages ─────────────────────────────────────────────────────────────
  const pageRows = (pagesResp.data ?? []) as TopPageRow[];
  const topPages = pageRows.map((r) => ({ path: r.path, count: Number(r.count) }));

  // ── Time series — densified daily buckets in UTC, ascending ───────────────
  const dailyRows = (dailyResp.data ?? []) as DailyCountRow[];
  const dailyMap = new Map<string, number>();
  for (const r of dailyRows) {
    dailyMap.set(r.day.slice(0, 10), Number(r.count));
  }
  const todayKey = utcDateKey(new Date());
  const startKey =
    window === "all"
      ? dailyRows.length > 0
        ? dailyRows[0].day.slice(0, 10)
        : todayKey
      : startIso.slice(0, 10);

  const timeSeries: Array<{ date: string; count: number }> = [];
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ty, tm - 1, td);
  const DAY_MS = 24 * 60 * 60 * 1000;
  let guard = 0;
  while (cursor <= endUtc && guard < 20000) {
    const key = utcDateKey(new Date(cursor));
    timeSeries.push({ date: key, count: dailyMap.get(key) ?? 0 });
    cursor += DAY_MS;
    guard++;
  }

  return {
    window,
    windowStart: startIso,
    generatedAt: new Date().toISOString(),
    totals: { totalEvents, activeUsers, eventsPerUser },
    byName,
    byCategory,
    topPages,
    timeSeries,
    funnels: {
      import: buildFunnel(IMPORT_FUNNEL_KEYS, countByName),
      cook: buildFunnel(COOK_FUNNEL_KEYS, countByName),
    },
  };
}
