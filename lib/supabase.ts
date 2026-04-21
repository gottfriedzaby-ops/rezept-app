import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Custom fetch that bypasses the Next.js data cache for all Supabase requests.
// Without this, Next.js caches the underlying HTTP responses and server
// components see stale rows even after router.refresh().
const noStoreFetch: typeof fetch = (url, options = {}) =>
  fetch(url, { ...options, cache: "no-store" });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: noStoreFetch },
});

export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: noStoreFetch } }
);
