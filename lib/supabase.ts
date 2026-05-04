import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Custom fetch that bypasses the Next.js data cache for all Supabase requests.
// Without this, Next.js caches the underlying HTTP responses and server
// components see stale rows even after router.refresh().
const noStoreFetch: typeof fetch = (url, options = {}) =>
  fetch(url, { ...options, cache: "no-store" });

// Lazy singletons — clients are created on first access, not at module load time.
// This prevents "supabaseUrl is required" errors during Next.js build when env
// vars are not available in the build environment.
let _supabase: SupabaseClient | undefined;
let _supabaseAdmin: SupabaseClient | undefined;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { fetch: noStoreFetch } }
      );
    }
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { global: { fetch: noStoreFetch } }
      );
    }
    return (_supabaseAdmin as unknown as Record<string | symbol, unknown>)[prop];
  },
});
