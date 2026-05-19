import { supabaseAdmin } from "@/lib/supabase";
import { computeCostUsd } from "@/lib/claude-pricing";

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
