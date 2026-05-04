import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  // Fallbacks prevent @supabase/ssr from throwing during Next.js SSR of client
  // components at build time. NEXT_PUBLIC_ vars are baked into the bundle from
  // Vercel env vars and will be correct at runtime.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
  );
}
